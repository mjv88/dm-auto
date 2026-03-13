// TODO(ui_screens phase): Accept PBX list from Zustand store
// TODO(ui_screens phase): On selection, set active PBX in store → router.push('/departments')

export interface PBX {
  id: string;
  name: string;
  fqdn: string;
}

interface PBXSelectorProps {
  // TODO: Wire from Zustand store in ui_screens phase
  pbxList?: PBX[];
}

export default function PBXSelector({ pbxList = [] }: PBXSelectorProps) {
  // TODO: Implement PBX selection logic
  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-2">Select your PBX:</h2>
      <div className="space-y-2">
        {pbxList.map((pbx) => (
          <button key={pbx.id} className="w-full text-left p-4 border rounded-lg">
            <p className="font-medium">{pbx.name}</p>
            <p className="text-sm text-gray-500">{pbx.fqdn}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
