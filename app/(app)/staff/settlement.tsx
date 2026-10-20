import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/features/auth/store';
import { useRiderDailySettlement } from '@/features/settlements/rider';
import { settlementTarget } from '@/features/settlements/navigation';
import { semantic, space } from '@/theme';

function rupiah(value: number): string { return 'Rp ' + value.toLocaleString('id-ID'); }

export default function RiderDailySettlementScreen() {
  const role = useAuth((s) => s.session?.user.role);
  const router = useRouter();
  const params = useLocalSearchParams<{ operating_date?: string }>();
  const operatingDate = settlementTarget({ operating_date: params.operating_date }).date;
  const settlement = useRiderDailySettlement(operatingDate);
  if (role !== 'STAFF') return <Screen><EmptyState icon="lock-outline" title="Layar ini khusus Rider" /></Screen>;

  const data = settlement.data;
  const status = data?.status === 'APPROVED' ? 'Sudah di-approve Finance'
    : data?.status === 'RECORDED' ? 'Sudah dicatat Finance' : 'Menunggu Finance';

  return <Screen refreshing={settlement.isRefetching} onRefresh={() => void settlement.refetch()}>
    <Text variant="h2">Setoran Harian</Text>
    <Text variant="caption" color={semantic.textMuted}>Angka dari Closing kamu. Finance yang mencatat setoran ya.</Text>
    {settlement.isError ? <EmptyState icon="wifi-off" title="Setoran belum bisa dibuka" subtitle={(settlement.error as Error).message} tone="danger"><Button label="Coba lagi" onPress={() => void settlement.refetch()} /></EmptyState> : null}
    {data?.closing ? <Card style={{ gap: space.md }}>
      <Text variant="bodyStrong">Coffee Bike {data.closing.cart_code} · {data.closing.operating_date}</Text>
      <Text variant="bodyStrong">Tunai yang perlu diserahkan: {rupiah(data.closing.cash_minor)}</Text>
      <Text variant="body">QRIS: {rupiah(data.closing.qris_minor)}</Text>
      <Text variant="body">Transfer: {rupiah(data.closing.transfer_minor)}</Text>
      <Text variant="body">Total jual: {rupiah(data.closing.total_minor)}</Text>
      <Text variant="bodyStrong">{status}</Text>
    </Card> : !settlement.isLoading && !settlement.isError ? <EmptyState icon="cash-multiple" title={operatingDate ? 'Belum ada Closing di tanggal ini' : 'Belum ada Closing hari ini'} subtitle="Isi Closing dulu, lalu angka setoran muncul di sini ya."><Button label="Buka Closing" onPress={() => router.push('/staff/closing')} /></EmptyState> : null}
  </Screen>;
}
