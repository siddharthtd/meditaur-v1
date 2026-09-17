import { PickerPage, type PickerItem } from "@meditaur/ui";

export function SymbolPicker({
  title,
  items,
  onBack,
  onSelect,
}: {
  title: string;
  items: PickerItem[];
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <main>
      <PickerPage title={title} items={items} onBack={onBack} onSelect={onSelect} />
    </main>
  );
}
