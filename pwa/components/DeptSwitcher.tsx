// TODO(ui_screens phase): Accept departments prop and current dept from Zustand store
// TODO(ui_screens phase): Render active DeptCard (disabled) + tappable DeptCards for switching
// TODO(ui_screens phase): On card tap, open ConfirmSheet with from/to department details
import DeptCard from './DeptCard';
import ConfirmSheet from './ConfirmSheet';
import type { Dept } from '@/types/auth';

export interface Department {
  id: number;
  name: string;
}

interface DeptSwitcherProps {
  // TODO: Wire from Zustand store in ui_screens phase
  departments?: Department[];
  currentDeptId?: number;
}

function toDept(d: Department): Dept {
  return { id: d.id, name: d.name, groupId: 0 };
}

export default function DeptSwitcher({ departments = [], currentDeptId }: DeptSwitcherProps) {
  // TODO: Implement switch flow with ConfirmSheet
  return (
    <div className="p-4 space-y-2">
      <p className="text-sm text-gray-500">Currently in:</p>
      {/* TODO: Render active department card */}
      <p className="text-sm text-gray-500 mt-4">Switch to:</p>
      {departments.map((dept) => (
        <DeptCard
          key={dept.id}
          dept={toDept(dept)}
          isDisabled={dept.id === currentDeptId}
          isCurrent={dept.id === currentDeptId}
        />
      ))}
      {/* TODO: Mount ConfirmSheet here, controlled by selection state */}
    </div>
  );
}
