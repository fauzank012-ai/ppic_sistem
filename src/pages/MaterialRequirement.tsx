import { useSearchParams } from 'react-router-dom';
import RawMaterial from './RawMaterial';
import CoilRequirement from './CoilRequirement';

export default function MaterialRequirement() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') || 'strip';

  return (
    <div className="flex flex-col h-full bg-[#FDFBF7]">
      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {type === 'strip' ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full">
            <RawMaterial />
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full">
            <CoilRequirement />
          </div>
        )}
      </div>
    </div>
  );
}
