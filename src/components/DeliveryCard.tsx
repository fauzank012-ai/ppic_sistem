import React from 'react';
import { Truck } from 'lucide-react';

interface DeliveryCardProps {
  ontimePercent: number;
  ontimeSubValue: React.ReactNode;
  totalDeliveryTon: number;
  onClick?: () => void;
}

export function DeliveryCard({ 
  ontimePercent, 
  ontimeSubValue, 
  totalDeliveryTon, 
  onClick 
}: DeliveryCardProps) {
  return (
    <div 
      onClick={onClick}
      className="bg-gradient-to-br from-[#059669] to-[#065f46] p-4 rounded-3xl shadow-2xl flex flex-col justify-between h-[180px] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] cursor-pointer relative overflow-hidden group border border-white/20"
    >
      {/* Decorative background elements */}
      <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-700" />
      <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-black/10 rounded-full blur-3xl" />
      
      {/* Icon */}
      <div className="absolute top-4 right-4 z-10 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6">
        <Truck className="w-8 h-8 text-white/90" />
      </div>

      {/* Header */}
      <div className="relative z-10">
        <span className="text-[14px] font-black text-white/90 uppercase tracking-[0.1em] leading-tight drop-shadow-sm block max-w-[70%]">
          DELIVERY
        </span>
      </div>
      
      {/* Content */}
      <div className="flex justify-between items-end relative z-10 mt-4">
        {/* Delivery Ontime Section */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest">DELIVERY ONTIME</span>
          <div className="flex items-center gap-2">
            <span className="text-4xl font-black text-white tracking-tighter drop-shadow-md">{(ontimePercent ?? 0).toFixed(1)}%</span>
            <div className="w-6 h-6 rounded-full border-2 border-white/30 flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full" />
            </div>
          </div>
          <div className="text-[10px] font-bold text-white/80 uppercase tracking-widest bg-black/10 backdrop-blur-sm px-3 py-1 rounded-full inline-block border border-white/10 w-fit whitespace-nowrap max-w-full overflow-hidden text-ellipsis">
            {ontimeSubValue}
          </div>
        </div>

        {/* Total Delivery Section */}
        <div className="flex flex-col gap-1 items-end">
          <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest">TOTAL DELIVERY</span>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-black text-white tracking-tighter drop-shadow-md">{Math.round(totalDeliveryTon).toLocaleString()}</span>
            <span className="text-lg font-bold text-white/90">Ton</span>
          </div>
          <div className="text-[10px] font-bold text-white/80 uppercase tracking-widest bg-black/10 backdrop-blur-sm px-3 py-1 rounded-full inline-block border border-white/10 w-fit whitespace-nowrap max-w-full overflow-hidden text-ellipsis">
            S/D KEMARIN
          </div>
        </div>
      </div>
    </div>
  );
}
