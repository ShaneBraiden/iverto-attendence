/**
 * New request — leave (with a live balance preview), punch correction, or
 * remote work. One form, switched by `kind`.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, TopBar } from '@/components/Screen';
import { Button, Card, Chip, Field, IconTile, Note, Row } from '@/components/ui';
import { DateSheet, TimeSheet } from '@/components/DateTimeSheet';
import { colors, spacing, type } from '@/theme';
import { atMinutes } from '@/lib/attendance';
import { isoDate } from '@/lib/datetime';
import {
  addDays,
  clock,
  countDays,
  createRequest,
  dayFor,
  dayDate,
  daysLabel,
  Half,
  hasBlockingIssue,
  KIND_LABEL,
  LEAVE_TYPES,
  leaveBalances,
  ME_ID,
  previewLeave,
  recentWorkingDays,
  Request,
  RequestKind,
  shortDay,
  todayIso,
} from '@/lib/data';

const ME = ME_ID.employee;
const KINDS: { key: RequestKind; icon: 'airplane-outline' | 'create-outline' | 'home-outline' }[] = [
  { key: 'LEAVE', icon: 'airplane-outline' },
  { key: 'CORRECTION', icon: 'create-outline' },
  { key: 'REMOTE', icon: 'home-outline' },
];

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

export default function NewRequest() {
  const params = useLocalSearchParams<{ kind?: RequestKind; date?: string }>();
  const [kind, setKind] = useState<RequestKind>(params.kind ?? 'LEAVE');

  // Leave / remote
  const [code, setCode] = useState('CL');
  const [from, setFrom] = useState(addDays(todayIso(), 1));
  const [to, setTo] = useState(addDays(todayIso(), 1));
  const [half, setHalf] = useState<Half | null>(null);
  const [sheet, setSheet] = useState<null | 'from' | 'to' | 'in' | 'out'>(null);

  // Correction
  const correctionDays = useMemo(() => {
    const list = recentWorkingDays(ME, 10);
    if (params.date && !list.includes(params.date)) list.unshift(params.date);
    if (!list.includes(todayIso())) list.unshift(todayIso());
    return list;
  }, [params.date]);
  const [cDate, setCDate] = useState(params.date ?? correctionDays.find((d) => d !== todayIso())!);
  const cDay = useMemo(() => dayFor(ME, cDate), [cDate]);
  const [fixIn, setFixIn] = useState(!cDay.firstIn);
  const [fixOut, setFixOut] = useState(!!cDay.firstIn || cDay.status === 'ABSENT');
  const [inTime, setInTime] = useState(9 * 60 + 30);
  const [outTime, setOutTime] = useState(18 * 60 + 30);

  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Request | null>(null);

  const type_ = LEAVE_TYPES.find((t) => t.code === code)!;
  const single = from === to;
  const preview = useMemo(
    () => (kind === 'LEAVE' ? previewLeave(ME, code, from, to, single && type_.allowHalf ? half : null) : null),
    [kind, code, from, to, half, single, type_.allowHalf],
  );
  const remoteDays = kind === 'REMOTE' ? countDays(ME, from, to, null) : 0;
  const balances = useMemo(() => leaveBalances(ME), []);

  const pickCorrectionDate = (d: string) => {
    setCDate(d);
    const day = dayFor(ME, d);
    setFixIn(!day.firstIn);
    setFixOut(!!day.firstIn || day.status === 'ABSENT');
  };

  const valid =
    reason.trim().length >= 5 &&
    (kind === 'LEAVE' ? !!preview && !hasBlockingIssue(preview) : kind === 'REMOTE' ? remoteDays > 0 : fixIn || fixOut);

  const submit = () => {
    setSaving(true);
    setTimeout(() => {
      const base = { employeeId: ME, reason: reason.trim() };
      const r =
        kind === 'LEAVE'
          ? createRequest({ ...base, kind, leaveType: code, from, to, half: single && type_.allowHalf ? half : null, days: preview!.days })
          : kind === 'REMOTE'
            ? createRequest({ ...base, kind, from, to, days: remoteDays })
            : createRequest({ ...base, kind, from: cDate, to: cDate, days: 0, inTime: fixIn ? inTime : null, outTime: fixOut ? outTime : null });
      setSaving(false);
      setCreated(r);
    }, 650);
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
                Kavya Iyer has been notified. You'll hear back here — switch to the manager view from Profile to approve it yourself in the demo.
              </Text>
            </View>
          </Card>
          <Button label="View request" icon="document-text-outline" onPress={() => router.replace(`/request/${created.id}`)} />
          <Button label="Done" variant="ghost" onPress={() => router.back()} />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="New request" subtitle="Goes to Kavya Iyer for approval" />
      <Screen clearTabBar={false}>
        <View style={styles.chips}>
          {KINDS.map((k) => (
            <Chip key={k.key} label={KIND_LABEL[k.key]} icon={k.icon} selected={kind === k.key} onPress={() => setKind(k.key)} />
          ))}
        </View>

        {kind === 'LEAVE' ? (
          <>
            <Card>
              <Text style={styles.label}>LEAVE TYPE</Text>
              <View style={[styles.chips, { marginTop: spacing.sm }]}>
                {balances.map((b) => (
                  <Chip key={b.type.code} label={`${b.type.name} · ${b.available}`} selected={code === b.type.code} onPress={() => setCode(b.type.code)} />
                ))}
              </View>
              <Text style={styles.hint}>{type_.hint}</Text>
            </Card>
            <Card>
              <View style={{ gap: spacing.md }}>
                <PickerField label="From" value={shortDay(from)} icon="calendar-outline" onPress={() => setSheet('from')} />
                <PickerField label="To" value={shortDay(to)} icon="calendar-outline" onPress={() => setSheet('to')} />
                {single && type_.allowHalf ? (
                  <View style={styles.chips}>
                    <Chip label="Full day" selected={!half} onPress={() => setHalf(null)} />
                    <Chip label="First half" selected={half === 'FIRST'} onPress={() => setHalf('FIRST')} />
                    <Chip label="Second half" selected={half === 'SECOND'} onPress={() => setHalf('SECOND')} />
                  </View>
                ) : null}
              </View>
            </Card>
            {preview ? (
              <Card>
                <Text style={styles.label}>PREVIEW</Text>
                <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                  <Row icon="hourglass-outline" label="Working days" value={daysLabel(preview.days)} />
                  <Row icon="wallet-outline" label="Available now" value={String(preview.available)} />
                  <Row
                    icon="trending-down-outline"
                    label="Balance after"
                    value={String(preview.after)}
                    color={preview.after < 0 ? colors.danger : colors.success}
                  />
                </View>
              </Card>
            ) : null}
            {preview?.warnings.map((w) => (
              <Note key={w} icon="alert-circle-outline" tone={hasBlockingIssue(preview) ? 'danger' : 'warning'} text={w} />
            ))}
          </>
        ) : null}

        {kind === 'REMOTE' ? (
          <>
            <Card>
              <View style={{ gap: spacing.md }}>
                <PickerField label="From" value={shortDay(from)} icon="calendar-outline" onPress={() => setSheet('from')} />
                <PickerField label="To" value={shortDay(to)} icon="calendar-outline" onPress={() => setSheet('to')} />
                <Row icon="hourglass-outline" label="Working days" value={daysLabel(remoteDays)} />
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
                {correctionDays.map((d) => {
                  const day = dayFor(ME, d);
                  const flagged = (day.missedPunch && !day.corrected) || day.status === 'ABSENT';
                  return (
                    <Chip
                      key={d}
                      label={d === todayIso() ? 'Today' : shortDay(d)}
                      icon={flagged ? 'alert-circle-outline' : undefined}
                      selected={cDate === d}
                      onPress={() => pickCorrectionDate(d)}
                    />
                  );
                })}
              </View>
            </Card>
            <Note
              icon="scan-outline"
              tone={cDay.missedPunch || cDay.status === 'ABSENT' ? 'warning' : 'info'}
              text={
                cDay.punches.length
                  ? `Recorded: ${cDay.punches.length} punch${cDay.punches.length > 1 ? 'es' : ''}, first at ${clock(minsOf(new Date(cDay.punches[0].at)))}${cDay.missedPunch ? ' — the out is missing.' : '.'}`
                  : 'No punches were recorded on this day.'
              }
            />
            <Card>
              <Text style={styles.label}>WHAT'S MISSING?</Text>
              <View style={[styles.chips, { marginTop: spacing.sm }]}>
                <Chip label="In punch" icon="log-in-outline" selected={fixIn} onPress={() => setFixIn(!fixIn)} />
                <Chip label="Out punch" icon="log-out-outline" selected={fixOut} onPress={() => setFixOut(!fixOut)} />
              </View>
              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                {fixIn ? <PickerField label="Actual in time" value={clock(inTime)} icon="time-outline" onPress={() => setSheet('in')} /> : null}
                {fixOut ? <PickerField label="Actual out time" value={clock(outTime)} icon="time-outline" onPress={() => setSheet('out')} /> : null}
              </View>
            </Card>
            <Note icon="shield-checkmark-outline" tone="brand" text="Corrections never edit your original punches — an approved one is added alongside them, with who approved it and why." />
          </>
        ) : null}

        <Card>
          <Field
            label="Reason"
            placeholder={kind === 'CORRECTION' ? 'e.g. Exit gate was offline' : kind === 'REMOTE' ? 'e.g. Client site visit in Hosur' : "e.g. Cousin's wedding in Chennai"}
            icon="chatbubble-outline"
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={240}
            hint="At least 5 characters"
          />
        </Card>

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
      <TimeSheet visible={sheet === 'in'} onClose={() => setSheet(null)} title="Actual in time" value={atMinutes(cDate, inTime)} onSelect={(t) => setInTime(minsOf(t))} />
      <TimeSheet visible={sheet === 'out'} onClose={() => setSheet(null)} title="Actual out time" value={atMinutes(cDate, outTime)} onSelect={(t) => setOutTime(minsOf(t))} />
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
