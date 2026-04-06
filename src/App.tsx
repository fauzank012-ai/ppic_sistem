/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Link, useLocation, useSearchParams } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { 
  LayoutGrid, 
  FileText, 
  UploadCloud, 
  Truck, 
  Box,
  Database,
  AlertCircle,
  RefreshCw,
  Users,
  LogOut,
  Package,
  Archive,
  Factory,
  Bell
} from 'lucide-react';

// Lazy load page components
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Report = lazy(() => import('./pages/Report'));
const LoadingVsCapacity = lazy(() => import('./pages/LoadingVsCapacity'));
const BottleneckMachine = lazy(() => import('./pages/BottleneckMachine'));
const MaterialRequirement = lazy(() => import('./pages/MaterialRequirement'));
const DeliveryMonitor = lazy(() => import('./pages/DeliveryMonitor'));
const OrderMonitor = lazy(() => import('./pages/OrderMonitor'));
const UploadData = lazy(() => import('./pages/UploadData'));
const Alerts = lazy(() => import('./pages/Alerts'));
const MasterData = lazy(() => import('./pages/MasterData'));
const MinMaxStock = lazy(() => import('./pages/MinMaxStock'));
const SlowMovingStock = lazy(() => import('./pages/SlowMovingStock'));
const ProductionOutput = lazy(() => import('./pages/ProductionOutput'));
const PlanVsActualWorkingHour = lazy(() => import('./pages/PlanVsActualWorkingHour'));
const PlanVsActualProd = lazy(() => import('./pages/PlanVsActualProd'));
const ProductionControl = lazy(() => import('./pages/ProductionControl'));
const DownTimeReportPage = lazy(() => import('./pages/DownTimeReportPage'));
const DownGradeRejectReportPage = lazy(() => import('./pages/DownGradeRejectReportPage'));
const RollChangingControl = lazy(() => import('./pages/RollChangingControl'));
const ProductionYield = lazy(() => import('./pages/ProductionYield'));
const SpeedAchievement = lazy(() => import('./pages/SpeedAchievement'));
const ProductivityRate = lazy(() => import('./pages/ProductivityRate'));
const WeldingDownTimePerformance = lazy(() => import('./pages/WeldingDownTimePerformance'));
const KombinasiSliting = lazy(() => import('./pages/KombinasiSliting'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const Planning = lazy(() => import('./pages/Planning'));
const InventoryControl = lazy(() => import('./pages/InventoryControl'));
const FinishedGoodsStock = lazy(() => import('./pages/FinishedGoodsStock'));
const NcStock = lazy(() => import('./pages/NcStock'));
const DeadStock = lazy(() => import('./pages/DeadStock'));
const ExcessStock = lazy(() => import('./pages/ExcessStock'));
const RawMaterialStock = lazy(() => import('./pages/RawMaterialStock'));
const ForecastVsActual = lazy(() => import('./pages/ForecastVsActual'));
const ForecastAccuracy = lazy(() => import('./pages/ForecastAccuracy'));
const SalesOrder = lazy(() => import('./pages/SalesOrder'));
const Backorder = lazy(() => import('./pages/Backorder'));
const LineUtilization = lazy(() => import('./pages/LineUtilization'));
const DemandTrend = lazy(() => import('./pages/DemandTrend'));
const MonitoringSubcont = lazy(() => import('./pages/MonitoringSubcont'));
const P3StockPage = lazy(() => import('./pages/P3StockPage'));
const CustomerPerformancePage = lazy(() => import('./pages/CustomerPerformancePage'));
const SoVsDeliveryPage = lazy(() => import('./pages/SoVsDeliveryPage'));
const DaftarShift = lazy(() => import('./pages/DaftarShift'));

import { isSupabaseConfigured, supabase } from './lib/supabase';
import { RefreshProvider } from './contexts/RefreshContext';
import { ViewModeProvider } from './contexts/ViewModeContext';
import { Header } from './components/Header';
import { SidebarLink } from './components/SidebarLink';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 300000, // 5 minutes
      gcTime: 300000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const fetchUserRole = async (userId: string) => {
    if (!isSupabaseConfigured) {
      console.warn("Supabase not configured, skipping user role fetch.");
      setUserRole('produksi');
      return;
    }
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      if (error.message?.includes('Failed to fetch') || (error as any).name === 'TypeError') {
        console.warn("Network error fetching user role for ID", userId, "- Supabase might be unreachable or blocked by CORS.");
      } else {
        console.error("Error fetching user role for ID", userId, ":", error.message || error);
        // If table doesn't exist, this will fail.
        if (error.message && error.message.includes('does not exist')) {
          console.error("The 'user_roles' table is missing from the database. Please run the setup SQL.");
        }
      }
      setUserRole('produksi');
      return;
    }

    if (data) {
      console.log("User role fetched successfully:", data.role);
      setUserRole(data.role);
    } else {
      setUserRole('produksi');
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      console.log('Checking session...', { isSupabaseConfigured });
      if (!isSupabaseConfigured) {
        console.warn('Supabase not configured, skipping session check');
        setIsAuthLoading(false);
        return;
      }
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        console.log('Session fetched:', session);
        setSession(session);
        if (session?.user) {
          await fetchUserRole(session.user.id);
        }
      } catch (err) {
        console.error('Session check failed:', err);
      } finally {
        setIsAuthLoading(false);
      }
    };
    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchUserRole(session.user.id);
      } else {
        setUserRole(null);
      }
      setIsAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (isAuthLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#FDFBF7]">
        <div className="flex flex-col items-center">
          <RefreshCw className="w-10 h-10 text-[#0A5C36] animate-spin mb-4" />
          <p className="text-[#0A5C36] font-bold tracking-wide">Memuat Sistem...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <Suspense fallback={null}>
        <Login />
      </Suspense>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RefreshProvider>
        <ViewModeProvider>
          <Router>
          <div className="flex h-screen bg-[#FDFBF7]">
          {/* Sidebar */}
          <aside className="w-64 bg-gradient-to-b from-[#0A5C36] via-[#0A5C36] to-[#10B981] relative overflow-hidden text-white flex flex-col shadow-2xl z-20">
            {/* Background Decorative Elements - Circle Effects */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-24 -left-24 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
              <div className="absolute top-1/4 -right-20 w-48 h-48 bg-emerald-400/10 rounded-full blur-2xl"></div>
              <div className="absolute bottom-1/4 -left-16 w-56 h-56 bg-white/5 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-20 -right-20 w-72 h-72 bg-emerald-300/10 rounded-full blur-3xl"></div>
              
              {/* Small crisp circles for "circle effects" */}
              <div className="absolute top-[15%] left-[10%] w-32 h-32 border border-white/5 rounded-full"></div>
              <div className="absolute top-[45%] right-[5%] w-24 h-24 border border-white/10 rounded-full"></div>
              <div className="absolute bottom-[20%] left-[20%] w-40 h-40 border border-white/5 rounded-full"></div>
            </div>

            <div className="relative z-10 flex flex-col h-full">
              <div className="h-24 flex items-center px-6">
                <div className="w-12 h-12 bg-white/15 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-center mr-3 shadow-2xl transform rotate-3">
                  <Box className="w-7 h-7 text-white" />
                </div>
                <div className="flex flex-col">
                </div>
              </div>
              
              <nav className="flex-1 px-4 py-2 overflow-y-auto custom-scrollbar">
                <div className="space-y-1 mb-6">
                  <SidebarLink to="/" icon={LayoutGrid} label="Dashboard" />
                  <SidebarLink to="/planning" icon={Package} label="Planning" />
                  <SidebarLink to="/production-control" icon={Factory} label="Production Control" />
                  <SidebarLink to="/delivery-monitor" icon={Truck} label="Delivery" />
                  <SidebarLink to="/inventory-control" icon={Archive} label="Inventory Control" />
                  <SidebarLink to="/report" icon={FileText} label="Report Regular Order" />
                  <SidebarLink to="/alerts" icon={Bell} label="Alerts" />
                  {userRole === 'admin' && (
                    <SidebarLink to="/user-management" icon={Users} label="User Management" />
                  )}
                </div>

                {(userRole === 'admin' || userRole === 'ppic' || userRole === 'ppiclt' || userRole === 'ppicst') && (
                  <div className="mt-8">
                    <div className="px-4 mb-3">
                      <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Data Management</h3>
                    </div>
                    <div className="space-y-0.5">
                      <SidebarLink to="/upload" icon={UploadCloud} label="Upload Data" />
                      {userRole === 'admin' && (
                        <SidebarLink to="/master-data" icon={Database} label="Master Data" />
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-10 pt-6 border-t border-white/5">
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center px-4 py-3 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-all group"
                  >
                    <LogOut className="w-5 h-5 mr-3 text-white/40 group-hover:text-white transition-colors" />
                    <span className="text-[13px] font-semibold tracking-wide">Logout</span>
                  </button>
                </div>
              </nav>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-auto bg-[#FDFBF7] flex flex-col">
            <Header userEmail={session?.user?.email} userRole={userRole} />
            {!isSupabaseConfigured && (
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-3 text-amber-800">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <div className="text-sm">
                  <span className="font-bold">Supabase not configured.</span> Please set <code className="bg-amber-100 px-1 rounded">VITE_SUPABASE_URL</code> and <code className="bg-amber-100 px-1 rounded">VITE_SUPABASE_KEY</code> in your environment variables.
                </div>
              </div>
            )}
            <div className="flex-1 overflow-auto">
              <Suspense fallback={
                <div className="flex-1 flex items-center justify-center bg-[#FDFBF7]">
                  <div className="flex flex-col items-center">
                    <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-4" />
                    <p className="text-emerald-800 font-medium">Memuat halaman...</p>
                  </div>
                </div>
              }>
                <Routes>
                  <Route path="/" element={<Dashboard userRole={userRole} />} />
                  <Route path="/planning" element={<Planning />} />
                  <Route path="/inventory-control" element={<InventoryControl />} />
                  <Route path="/finished-goods-stock" element={<FinishedGoodsStock />} />
                  <Route path="/nc-stock" element={<NcStock />} />
                  <Route path="/raw-material-stock" element={<RawMaterialStock />} />
                  <Route path="/forecast-vs-actual" element={<ForecastVsActual />} />
                  <Route path="/forecast-accuracy" element={<ForecastAccuracy />} />
                  <Route path="/sales-order" element={<SalesOrder />} />
                  <Route path="/backorder" element={<Backorder />} />
                  <Route path="/line-utilization" element={<LineUtilization />} />
                  <Route path="/demand-trend" element={<DemandTrend />} />
                  <Route path="/report" element={<Report />} />
                  <Route path="/loading-vs-capacity" element={<LoadingVsCapacity userRole={userRole} />} />
                  <Route path="/bottleneck-machine" element={<BottleneckMachine />} />
                  <Route path="/min-max-stock" element={<MinMaxStock />} />
                  <Route path="/slow-moving-stock" element={<SlowMovingStock />} />
                  <Route path="/dead-stock" element={<DeadStock />} />
                  <Route path="/excess-stock" element={<ExcessStock />} />
                  <Route path="/production-output" element={<ProductionOutput userRole={userRole} />} />
                  <Route path="/plan-vs-actual-working-hour" element={<PlanVsActualWorkingHour />} />
                  <Route path="/plan-vs-actual" element={<PlanVsActualProd />} />
                  <Route path="/production-control" element={<ProductionControl />} />
                  <Route path="/down-time-report" element={<DownTimeReportPage />} />
                  <Route path="/down-grade-reject-report" element={<DownGradeRejectReportPage />} />
                  <Route path="/roll-changing-control" element={<RollChangingControl />} />
                  <Route path="/production-yield" element={<ProductionYield />} />
                  <Route path="/speed-achievement" element={<SpeedAchievement />} />
                  <Route path="/productivity-rate" element={<ProductivityRate />} />
                  <Route path="/welding-downtime" element={<WeldingDownTimePerformance />} />
                  <Route path="/material-requirement" element={<MaterialRequirement />} />
                  <Route path="/kombinasi-sliting" element={<KombinasiSliting />} />
                  <Route path="/monitoring-subcont" element={<MonitoringSubcont />} />
                  <Route path="/daftar-shift" element={<DaftarShift />} />
                  <Route path="/order-monitor" element={<OrderMonitor />} />
                  <Route path="/delivery-monitor" element={<DeliveryMonitor />} />
                  <Route path="/p3-stock" element={<P3StockPage />} />
                  <Route path="/customer-performance" element={<CustomerPerformancePage />} />
                  <Route path="/so-vs-delivery" element={<SoVsDeliveryPage />} />
                  <Route path="/alerts" element={<Alerts />} />
                  {(userRole === 'admin' || userRole === 'ppic' || userRole === 'ppiclt' || userRole === 'ppicst') && (
                    <Route path="/upload" element={<UploadData />} />
                  )}
                  {userRole === 'admin' && (
                    <>
                      <Route path="/master-data" element={<MasterData />} />
                      <Route path="/user-management" element={<UserManagement />} />
                    </>
                  )}
                </Routes>
              </Suspense>
            </div>
          </main>
        </div>
      </Router>
        </ViewModeProvider>
      </RefreshProvider>
    </QueryClientProvider>
  );
}
