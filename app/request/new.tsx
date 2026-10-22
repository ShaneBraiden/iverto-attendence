/**
 * New request — leave (with the server's deduction preview), punch correction,
 * or remote work. One form, switched by `kind`.
 *
 * Every submit carries an `Idempotency-Key`. The key is tied to the exact
 * payload, so pressing "Send" again after a dropped connection replays the
 * same request rather than filing a second one, while editing the form first
 * gets a fresh key.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Screen, TopBar } from '@/components/Screen';
import { Button, Card, Chip, ErrorState, Field, IconTile, Note, Row } from '@/components/ui';
import { SkeletonForm } from '@/components/Skeleton';
import { DateSheet, TimeSheet } from '@/components/DateTimeSheet';
import { colors, spacing, type } from '@/theme';
import {
  applyCorrection,
  applyLeave,
  applyRemote,
  getLeaveTypes,
  getMonth,
  Half,
  LeavePreview,
  LeaveRange,
  messageOf,
  MonthDay,
  newIdempotencyKey,
  previewLeave,
  Req,
  RequestKind,
  uploadFile,
} from '@/lib/api';
import { MAX_UPLOAD_BYTES } from '@/lib/api/config';
import { goBack, useMe } from '@/lib/auth';
import { atLocal } from '@/lib/attendance';
import { isoDate } from '@/lib/datetime';
import {
  addDays,
  clock,
  dayDate,
  daysBetween,
  daysLabel,
  hhmm,
  minutesOf,
  monthKey,
  shortDay,
  timeLabel,
  todayIso,
} from '@/lib/format';
import { isKind, KIND_LABEL } from '@/lib/requests';
import { statusInfo } from '@/lib/status';
import { useQuery } from '@/lib/useQuery';

const KIND_ICONS: Record<RequestKind, 'airplane-outline' | 'create-outline' | 'home-outline'> = {
  LEAVE: 'airplane-outline',
  CORRECTION: 'create-outline',
  REMOTE: 'home-outline',
};

const ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

function PickerField({ label, value, icon, onPress }: { label: string; value: string; icon: 'calendar-outline' | 'time-outline'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <View pointerEvents="none">
        <Field label={label} value={value} icon={icon} editable={false} />
      </View>
    </Pressable>
  );
}

const minsOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** `pdf` → `application/pdf`, for pickers that do not report a type. */
function contentTypeOf(name: string, reported?: string | null) {
  if (reported && ATTACHMENT_TYPES.includes(reported)) return reported;
  const ext = name.split('.').pop()?.toLowerCase();
  return ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : null;
}

/** The last `count` days up to today, newest first, skipping known days off. */
function correctionDays(days: MonthDay[], count: number, extra?: string) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: string[] = [];
  for (let i = 0, d = todayIso(); out.length < count && i < 31; i++, d = addDays(d, -1)) {
    const known = byDate.get(d);
    if (known && (known.dayType === 'WEEKLY_OFF' || known.dayType === 'HOLIDAY')) continue;
    out.push(d);
  }
  if (extra && !out.includes(extra)) out.unshift(extra);
  return out;
}

export default function NewRequest() {
  const me = useMe();
  const params = useLocalSearchParams<{ kind?: string; date?: string }>();
  const allowed = (['LEAVE', 'CORRECTION', 'REMOTE'] as RequestKind[]).filter(
    (k) => (k !== 'LEAVE' || me.features?.leave !== false) && (k !== 'REMOTE' || !!me.features?.remoteWork),
  );
  const [kind, setKind] = useState<RequestKind>(isKind(params.kind) && allowed.includes(params.kind) ? params.kind : allowed[0]);
  const managerName = me.employee?.manager?.fullName ?? null;

  /* ---- Leave / remote */
  const [typeId, setTypeId] = useState<string | null>(null);
  const [from, setFrom] = useState(addDays(todayIso(), 1));
  const [to, setTo] = useState(addDays(todayIso(), 1));
  const [half, setHalf] = useState<Half | null>(null);
  const [sheet, setSheet] = useState<null | 'from' | 'to' | 'in' | 'out'>(null);
  const [attachment, setAttachment] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  const types = useQuery(() => (kind === 'LEAVE' ? getLeaveTypes() : Promise.resolve([])), [kind === 'LEAVE']);
  const leaveTypes = types.data ?? [];
  const lt = leaveTypes.find((t) => t.id === typeId) ?? null;
  useEffect(() => {
    if (!typeId && leaveTypes.length) setTypeId(leaveTypes[0].id);
  }, [typeId, leaveTypes]);

  const single = from === to;
  const halfDay = single && lt?.allowHalfDay ? half : null;
  /* Halves go on the wire only for a half day — a full day with
     FIRST / SECOND attached is booked by the server as 0.5. */
  const range: LeaveRange | null = lt
    ? { leaveTypeId: lt.id, from, to, ...(halfDay ? { startHalf: halfDay, endHalf: halfDay } : {}) }
    : null;
  const rangeSig = range ? JSON.stringify(range) : '';

  const [preview, setPreview] = useState<{ sig: string; data?: LeavePreview; error?: string } | null>(null);
  useEffect(() => {
    if (kind !== 'LEAVE' || !range) return;
    let alive = true;
    const t = setTimeout(() => {
      previewLeave(range)
        .then((data) => alive && setPreview({ sig: rangeSig, data }))
        .catch((e) => alive && setPreview({ sig: rangeSig, error: messageOf(e, 'Could not check these dates.') }));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, rangeSig]);
  const current = preview?.sig === rangeSig ? preview : null;
  const noticeDays = Math.round((dayDate(from).getTime() - dayDate(todayIso()).getTime()) / 86_400_000);
  const shortNotice = !!lt && noticeDays < lt.minNoticeDays;

  /* ---- Correction */
  const month = useQuery(async () => {
    if (kind !== 'CORRECTION') return [] as MonthDay[];
    const now = new Date();
    const keys = [monthKey(now.getFullYear(), now.getMonth())];
    /* Early in the month, the last ten working days reach back into the previous one. */
    if (now.getDate() < 14) {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      keys.push(monthKey(prev.getFullYear(), prev.getMonth()));
    }
    const months = await Promise.all(keys.map((k) => getMonth(k).catch(() => null)));
    return months.flatMap((m) => m?.days ?? []);
  }, [kind === 'CORRECTION']);
  const monthDays = month.data ?? [];
  const dates = useMemo(() => correctionDays(monthDays, 10, params.date), [monthDays, params.date]);
  const [cDate, setCDate] = useState(params.date ?? addDays(todayIso(), -1));
  /* Opened without a date: start on the most recent day that needs fixing. */
  const picked = useRef(!!params.date);
  useEffect(() => {
    if (picked.current || !monthDays.length) return;
    picked.current = true;
    const flagged = dates.find((d) => monthDays.some((m) => m.date === d && (m.missedPunch || m.status === 'ABSENT')));
    if (flagged) setCDate(flagged);
  }, [dates, monthDays]);
  const cDay = monthDays.find((d) => d.date === cDate) ?? null;
  const [fixIn, setFixIn] = useState<boolean | null>(null);
  const [fixOut, setFixOut] = useState<boolean | null>(null);
  const [inTime, setInTime] = useState<number | null>(null);
  const [outTime, setOutTime] = useState<number | null>(null);
  /* Defaults follow the selected day until the person changes them. */
  const wantIn = fixIn ?? !cDay?.firstIn;
  const wantOut = fixOut ?? (!cDay?.lastOut || !!cDay?.missedPunch);
  const inMins = inTime ?? minutesOf(cDay?.firstIn) ?? 9 * 60;
  const outMins = outTime ?? minutesOf(cDay?.lastOut) ?? 18 * 60;
  const pickCorrectionDate = (d: string) => {
    setCDate(d);
    setFixIn(null);
    setFixOut(null);
    setInTime(null);
    setOutTime(null);
  };

  /* ---- Shared */
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<Req | null>(null);
  const idem = useRef<{ sig: string; key: string } | null>(null);
  const keyFor = (sig: string) => {
    if (idem.current?.sig !== sig) idem.current = { sig, key: newIdempotencyKey() };
    return idem.current.key;
  };

  const remoteDays = kind === 'REMOTE' ? daysBetween(from, to) : 0;
  const leaveBlocked =
    !current ||
    !!current.error ||
    !current.data ||
    current.data.workingDays <= 0 ||
    !current.data.canSubmit ||
    current.data.errors.length > 0 ||
    (!current.data.sufficient && !lt?.allowNegative) ||
    (!!lt?.requiresAttachment && !attachment);

  const valid =
    reason.trim().length >= 5 &&
    (kind === 'LEAVE' ? !!range && !leaveBlocked : kind === 'REMOTE' ? remoteDays > 0 : wantIn || wantOut);

  const pickAttachment = async () => {
    setAttachError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ATTACHMENT_TYPES, copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      if (!contentTypeOf(a.name, a.mimeType)) return setAttachError('Attach a PDF, JPG or PNG file.');
      if (a.size && a.size > MAX_UPLOAD_BYTES) return setAttachError('That file is larger than 5 MB. Pick a smaller one.');
      setAttachment(a);
    } catch (e) {
      setAttachError(messageOf(e, 'Could not open that file.'));
    }
  };

  const submit = async () => {
    setSaving(true);
    setSubmitError(null);
    try {
      const why = reason.trim();
      let r: Req;
      if (kind === 'LEAVE' && range) {
        let attachmentKey: string | null = null;
        if (attachment) {
          const up = await uploadFile({
            fileName: attachment.name,
            contentType: contentTypeOf(attachment.name, attachment.mimeType)!,
            dataBase64: await new File(attachment.uri).base64(),
            size: attachment.size,
          });
          attachmentKey = up.key;
        }
        const body = { ...range, reason: why, attachmentKey };
        r = await applyLeave(body, keyFor(JSON.stringify({ ...body, attachmentKey: attachment?.uri ?? null })));
      } else if (kind === 'REMOTE') {
        const body = { from, to, reason: why };
        r = await applyRemote(body, keyFor(JSON.stringify(body)));
      } else {
        const body = {
          date: cDate,
          ...(wantIn ? { in: hhmm(inMins) } : {}),
          ...(wantOut ? { out: hhmm(outMins) } : {}),
          reason: why,
        };
        r = await applyCorrection(body, keyFor(JSON.stringify(body)));
      }
      setCreated(r);
    } catch (e) {
      setSubmitError(messageOf(e, 'The request was not sent. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Request sent" />
        <Screen clearTabBar={false}>
          <Card>
            <View style={styles.done}>
              <IconTile icon="checkmark-circle-outline" size={64} tint={colors.success} bg={colors.successBg} />
              <Text style={styles.doneTitle}>{KIND_LABEL[created.kind]} request sent</Text>
              <Text style={styles.doneSub}>
                {managerName ? `${managerName} has been notified.` : 'Your approver has been notified.'} You'll get a
                notification when it's decided.
              </Text>
            </View>
          </Card>
          {created.id ? (
            <Button
              label="View request"
              icon="document-text-outline"
              onPress={() => router.replace(`/request/${created.id}?kind=${created.kind}`)}
            />
          ) : null}
          <Button label="Done" variant="ghost" onPress={() => goBack(me)} />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="New request" subtitle={managerName ? `Goes to ${managerName} for approval` : 'Goes to your manager for approval'} />
      <Screen clearTabBar={false}>
        <View style={styles.chips}>
          {allowed.map((k) => (
            <Chip
              key={k}
              label={KIND_LABEL[k]}
              icon={KIND_ICONS[k]}
              selected={kind === k}
              onPress={() => {
                setKind(k);
                setSubmitError(null);
              }}
            />
          ))}
        </View>

        {kind === 'LEAVE' ? (
          types.loading && !types.data ? (
            <SkeletonForm fields={3} />
          ) : types.error ? (
            <ErrorState error={types.error} onRetry={types.refetch} />
          ) : !leaveTypes.length ? (
            <Note icon="information-circle-outline" tone="info" text="No leave types are set up for you yet. Ask HR." />
          ) : (
            <>
              <Card>
                <Text style={styles.label}>LEAVE TYPE</Text>
                <View style={[styles.chips, { marginTop: spacing.sm }]}>
                  {leaveTypes.map((t) => (
                    <Chip key={t.id} label={`${t.name} · ${t.available}`} selected={typeId === t.id} onPress={() => setTypeId(t.id)} />
                  ))}
                </View>
                {lt ? (
                  <Text style={styles.hint}>
                    {[
                      lt.allowHalfDay ? 'Half days allowed' : 'Full days only',
                      lt.minNoticeDays ? `${daysLabel(lt.minNoticeDays)} notice` : null,
                      lt.requiresAttachment ? 'Supporting document required' : null,
                      lt.paid === false ? 'Unpaid' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : null}
              </Card>
              <Card>
                <View style={{ gap: spacing.md }}>
                  <PickerField label="From" value={shortDay(from)} icon="calendar-outline" onPress={() => setSheet('from')} />
                  <PickerField label="To" value={shortDay(to)} icon="calendar-outline" onPress={() => setSheet('to')} />
                  {single && lt?.allowHalfDay ? (
                    <View style={styles.chips}>
                      <Chip label="Full day" selected={!half} onPress={() => setHalf(null)} />
                      <Chip label="First half" selected={half === 'FIRST'} onPress={() => setHalf('FIRST')} />
                      <Chip label="Second half" selected={half === 'SECOND'} onPress={() => setHalf('SECOND')} />
                    </View>
                  ) : null}
                </View>
              </Card>
              {current?.data ? (
                <Card>
                  <Text style={styles.label}>PREVIEW</Text>
                  <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                    <Row icon="hourglass-outline" label="Working days" value={daysLabel(current.data.workingDays)} />
                    <Row icon="wallet-outline" label="Available now" value={String(current.data.available)} />
                    <Row
                      icon="trending-down-outline"
                      label="Balance after"
                      value={String(current.data.availableAfter)}
                      color={current.data.sufficient ? colors.success : colors.danger}
                    />
                    {current.data.breakdown.some((b) => b.deduction === 0) ? (
                      <Row
                        icon="cafe-outline"
                        label="Not counted"
                        value={current.data.breakdown
                          .filter((b) => b.deduction === 0)
                          .map((b) => (b.type ? `${shortDay(b.date)} (${statusInfo(b.type).label.toLowerCase()})` : shortDay(b.date)))
                          .join(', ')}
                      />
                    ) : null}
                  </View>
                </Card>
              ) : !current ? (
                <Note icon="hourglass-outline" tone="info" text="Checking these dates…" />
              ) : null}
              {current?.error ? <Note icon="alert-circle-outline" tone="danger" text={current.error} /> : null}
              {current?.data?.errors.map((e) => (
                <Note key={`e:${e}`} icon="alert-circle-outline" tone="danger" text={e} />
              ))}
              {current?.data?.warnings.map((w) => (
                <Note key={`w:${w}`} icon="alarm-outline" tone="warning" text={w} />
              ))}
              {current?.data && current.data.workingDays <= 0 ? (
                <Note icon="alert-circle-outline" tone="danger" text="No working days in this range." />
              ) : null}
              {current?.data &&
              !current.data.canSubmit &&
              !current.data.errors.length &&
              (current.data.sufficient || lt?.allowNegative) &&
              current.data.workingDays > 0 ? (
                <Note icon="alert-circle-outline" tone="danger" text="These dates can't be applied for. Try different dates." />
              ) : null}
              {current?.data && !current.data.sufficient ? (
                <Note
                  icon="alert-circle-outline"
                  tone={lt?.allowNegative ? 'warning' : 'danger'}
                  text={
                    lt?.allowNegative
                      ? 'This takes your balance below zero. It may be adjusted against future leave.'
                      : `Only ${current.data.available} day${current.data.available === 1 ? '' : 's'} available.`
                  }
                />
              ) : null}
              {shortNotice && lt ? (
                <Note icon="alarm-outline" tone="warning" text={`${lt.name} needs ${daysLabel(lt.minNoticeDays)} notice — your manager may decline it.`} />
              ) : null}
              {lt?.requiresAttachment ? (
                <Card>
                  <Text style={styles.label}>SUPPORTING DOCUMENT</Text>
                  <Text style={styles.hint}>PDF, JPG or PNG · up to 5 MB</Text>
                  <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                    {attachment ? (
                      <Row icon="document-attach-outline" label="Attached" value={attachment.name} />
                    ) : null}
                    <Button
                      label={attachment ? 'Replace file' : 'Attach file'}
                      icon="attach-outline"
                      variant="secondary"
                      onPress={pickAttachment}
                    />
                    {attachError ? <Note icon="alert-circle-outline" tone="danger" text={attachError} /> : null}
                  </View>
                </Card>
              ) : null}
            </>
          )
        ) : null}

        {kind === 'REMOTE' ? (
          <>
            <Card>
              <View style={{ gap: spacing.md }}>
                <PickerField label="From" value={shortDay(from)} icon="calendar-outline" onPress={() => setSheet('from')} />
                <PickerField label="To" value={shortDay(to)} icon="calendar-outline" onPress={() => setSheet('to')} />
                <Row icon="hourglass-outline" label="Days" value={daysLabel(remoteDays)} />
              </View>
            </Card>
            <Note icon="phone-portrait-outline" tone="info" text="On approved remote days you check in and out from the app. Your location is saved with each punch." />
          </>
        ) : null}

        {kind === 'CORRECTION' ? (
          <>
            <Card>
              <Text style={styles.label}>WHICH DAY?</Text>
              <View style={[styles.chips, { marginTop: spacing.sm }]}>
                {dates.map((d) => {
                  const known = monthDays.find((m) => m.date === d);
                  const flagged = !!known && (known.missedPunch || known.status === 'ABSENT');
                  return (
                    <Chip
                      key={d}
                      label={d === todayIso() ? 'Today' : shortDay(d)}
                      icon={flagged ? 'alert-circle-outline' : undefined}
                      selected={cDate === d}
                      onPress={() => {
                        picked.current = true;
                        pickCorrectionDate(d);
                      }}
                    />
                  );
                })}
              </View>
            </Card>
            {cDay ? (
              <Note
                icon="scan-outline"
                tone={cDay.missedPunch || cDay.status === 'ABSENT' ? 'warning' : 'info'}
                text={
                  cDay.firstIn
                    ? `Recorded: in ${timeLabel(cDay.firstIn)}${cDay.lastOut ? `, out ${timeLabel(cDay.lastOut)}` : ''}${cDay.missedPunch ? ' — a punch is missing.' : '.'}`
                    : 'No punches were recorded on this day.'
                }
              />
            ) : null}
            <Card>
              <Text style={styles.label}>WHAT'S MISSING?</Text>
              <View style={[styles.chips, { marginTop: spacing.sm }]}>
                <Chip label="In punch" icon="log-in-outline" selected={wantIn} onPress={() => setFixIn(!wantIn)} />
                <Chip label="Out punch" icon="log-out-outline" selected={wantOut} onPress={() => setFixOut(!wantOut)} />
              </View>
              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                {wantIn ? <PickerField label="Actual in time" value={clock(inMins)} icon="time-outline" onPress={() => setSheet('in')} /> : null}
                {wantOut ? <PickerField label="Actual out time" value={clock(outMins)} icon="time-outline" onPress={() => setSheet('out')} /> : null}
              </View>
            </Card>
            <Note icon="shield-checkmark-outline" tone="brand" text="Corrections never edit your original punches — an approved one is added alongside them, with who approved it and why." />
          </>
        ) : null}

        <Card>
          <Field
            label="Reason"
            placeholder={kind === 'CORRECTION' ? 'e.g. Terminal was offline at the gate' : kind === 'REMOTE' ? 'e.g. Vendor audit at the client site' : 'e.g. Family function'}
            icon="chatbubble-outline"
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={500}
            hint="At least 5 characters"
          />
        </Card>

        {submitError ? <Note icon="alert-circle-outline" tone="danger" text={submitError} /> : null}
        <Button label={`Send ${KIND_LABEL[kind].toLowerCase()} request`} icon="send-outline" loading={saving} disabled={!valid} onPress={submit} />
      </Screen>

      <DateSheet
        visible={sheet === 'from'}
        onClose={() => setSheet(null)}
        title="From"
        value={dayDate(from)}
        onSelect={(d) => {
          const iso = isoDate(d);
          setFrom(iso);
          if (to < iso) setTo(iso);
        }}
      />
      <DateSheet
        visible={sheet === 'to'}
        onClose={() => setSheet(null)}
        title="To"
        value={dayDate(to)}
        minDate={dayDate(from)}
        onSelect={(d) => setTo(isoDate(d))}
      />
      <TimeSheet
        visible={sheet === 'in'}
        onClose={() => setSheet(null)}
        title="Actual in time"
        value={atLocal(cDate, hhmm(inMins)) ?? new Date()}
        onSelect={(t) => setInTime(minsOf(t))}
      />
      <TimeSheet
        visible={sheet === 'out'}
        onClose={() => setSheet(null)}
        title="Actual out time"
        value={atLocal(cDate, hhmm(outMins)) ?? new Date()}
        onSelect={(t) => setOutTime(minsOf(t))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  label: { ...type.caption, color: colors.textFaint },
  hint: { ...type.small, color: colors.textMuted, marginTop: spacing.md },
  done: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  doneTitle: { ...type.h2, color: colors.text, textAlign: 'center' },
  doneSub: { ...type.small, color: colors.textMuted, textAlign: 'center' },
});

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';
