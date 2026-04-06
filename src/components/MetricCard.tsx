import React from 'react';

interface MetricCardProps {
  icon?: any;
  title: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  color?: 'emerald' | 'blue' | 'indigo' | 'rose' | 'amber' | 'slate';
  colorClass?: string;
  gradientClass?: string;
  iconText?: string;
  onClick?: () => void;
}

const colorMap = {
  emerald: {
    colorClass: "bg-emerald-500/20",
    gradientClass: "from-emerald-500 to-emerald-700"
  },
  blue: {
    colorClass: "bg-blue-500/20",
    gradientClass: "from-blue-500 to-blue-700"
  },
  indigo: {
    colorClass: "bg-indigo-500/20",
    gradientClass: "from-indigo-500 to-indigo-700"
  },
  rose: {
    colorClass: "bg-rose-500/20",
    gradientClass: "from-rose-500 to-rose-700"
  },
  amber: {
    colorClass: "bg-amber-500/20",
    gradientClass: "from-amber-500 to-amber-700"
  },
  slate: {
    colorClass: "bg-slate-500/20",
    gradientClass: "from-slate-500 to-slate-700"
  }
};

export function MetricCard({ 
  icon: Icon, 
  title, 
  value, 
  subValue, 
  color = 'slate',
  colorClass, 
  gradientClass,
  iconText,
  onClick
}: MetricCardProps) {
  const finalColorClass = colorClass || colorMap[color].colorClass;
  const finalGradientClass = gradientClass || colorMap[color].gradientClass;

  return (
    <div 
      onClick={onClick}
      className={`bg-gradient-to-br ${finalGradientClass} p-4 rounded-3xl shadow-2xl flex flex-col justify-between h-[180px] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] cursor-pointer relative overflow-hidden group border border-white/20`}
    >
      {/* Decorative background elements */}
      <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-700" />
      <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-black/10 rounded-full blur-3xl" />
      
      {/* Icon */}
      <div className={`absolute top-4 right-4 z-10 flex items-center justify-center w-10 h-10 rounded-2xl ${finalColorClass} backdrop-blur-xl text-white shadow-2xl shrink-0 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 border border-white/30`}>
        {iconText ? (
          <span className="font-black text-[11px] tracking-tighter">{iconText}</span>
        ) : Icon ? (
          <Icon className="w-5 h-5" />
        ) : null}
      </div>

      {/* Top Row: Title */}
      <div className="relative z-10">
        <span className="text-[14px] font-black text-white/90 uppercase tracking-[0.1em] leading-tight max-w-[70%] drop-shadow-sm block">
          {title}
        </span>
      </div>
      
      {/* Content Section: Value and SubValue at bottom */}
      <div className="flex flex-col gap-1 relative z-10 mt-4">
        <div className="text-4xl font-black text-white tracking-tighter flex items-baseline gap-2 drop-shadow-md">
          {value}
        </div>
        {subValue && (
          <div className="text-[10px] font-bold text-white/80 uppercase tracking-widest bg-black/10 backdrop-blur-sm px-3 py-1 rounded-full inline-block border border-white/10 w-fit whitespace-nowrap max-w-full overflow-hidden text-ellipsis">
            {subValue}
          </div>
        )}
      </div>
    </div>
  );
}
