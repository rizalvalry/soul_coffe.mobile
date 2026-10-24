import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { enter } from '@/components/ui/Motion';
import { useIndexController, type Kitchen } from '@/features/showcase/useIndexController';
import { request } from '@/lib/api';
import { brand, radius, semantic, space } from '@/theme';

// Keep the reviewed API contract snapshot's source path stable while selection lives in the hook.
const loadKitchens = () => request<Kitchen[]>('/showcase/kitchens');

export default function KitchenOperationsScreen() {
  const { actions, kitchenId, loaded, selectionError, kitchens, selected, choose, goTo } = useIndexController(loadKitchens);

  return (
    <Screen>
      <View style={styles.heading}>
        <Text variant="display">Produksi</Text>
        <Text variant="caption">Pilih Dapur Pusat yang kamu bantu hari ini. Pilihan ini tersimpan di HP sampai kamu ganti.</Text>
      </View>
      {kitchens.isError ? <Banner tone="danger" message="Daftar dapur belum bisa dimuat. Coba lagi ya." /> : null}
      {selectionError ? <Banner tone="danger" message={selectionError} /> : null}
      {kitchens.isError ? <Button label="Coba Lagi" onPress={() => void kitchens.refetch()} /> : null}
      {loaded ? kitchens.data?.map((kitchen, index) => (
        <Animated.View key={kitchen.id} entering={enter('below', index)}>
          <Card style={[styles.kitchenCard, kitchen.id === kitchenId && styles.selectedKitchen]}>
            <Text variant="bodyStrong" color={kitchen.id === kitchenId ? brand[700] : semantic.text}>{kitchen.name}</Text>
            <Button label={kitchen.id === kitchenId ? 'Dapur dipilih' : 'Pakai dapur ini'}
              variant={kitchen.id === kitchenId ? 'secondary' : 'primary'}
              onPress={() => void choose(kitchen.id)} />
          </Card>
        </Animated.View>
      )) : null}
      {kitchens.data?.length === 0 ? <Banner tone="warning" message="Belum ada Dapur Pusat yang aktif." /> : null}
      {selected ? (
        <View style={styles.actions}>
          <Text variant="h2">Alur di {selected.name}</Text>
          {actions.map((action) => (
            <Button key={action.label} label={action.label} variant="secondary"
              onPress={() => goTo(action.route)} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: space.xs, marginBottom: space.xs },
  kitchenCard: { gap: space.md, borderRadius: radius.card },
  selectedKitchen: { backgroundColor: brand[50] },
  actions: { gap: space.sm, marginTop: space.sm },
});
