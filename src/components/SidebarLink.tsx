import { memo } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface SidebarLinkProps {
  to: string;
  icon: any;
  label: string;
}

export const SidebarLink = memo(({ to, icon: Icon, label }: SidebarLinkProps) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  
  return (
    <Link 
      to={to} 
      className={`flex items-center px-4 py-3 rounded-xl transition-all mb-1 group ${
        isActive 
          ? 'bg-white/20 text-white font-bold shadow-lg backdrop-blur-md' 
          : 'text-white/70 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon className={`w-5 h-5 mr-3 transition-all duration-300 ${isActive ? 'text-white scale-110' : 'text-white/60 group-hover:text-white group-hover:scale-110'}`} />
      <span className="text-[13px] tracking-wide">{label}</span>
    </Link>
  );
});
