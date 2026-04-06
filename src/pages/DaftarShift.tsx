import React, { useState, useMemo } from 'react';
import { Download, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Edit2, Save, X } from 'lucide-react';
import { fetchAllRows, supabase } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

const getMonday = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
};

export default function DaftarShift() {
  const [activeCategory, setActiveCategory] = useState<'tubing' | 'haven' | 'others'>('tubing');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isEditing, setIsEditing] = useState(false);
  const [editedShifts, setEditedShifts] = useState<Record<string, { plan_working_hour: string }>>({});
  const [isSaving, setIsSaving] = useState(false);
  
  const { refreshKey, triggerRefresh } = useRefresh();
  const queryClient = useQueryClient();

  const startOfWeek = getMonday(currentDate);
  const datesOfWeek = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [startOfWeek]);

  const startDateStr = datesOfWeek[0].toISOString().split('T')[0];
  const endDateStr = datesOfWeek[6].toISOString().split('T')[0];

  const { data, isLoading: loading } = useQuery({
    queryKey: ['daftar_shift_weekly', startDateStr, endDateStr, refreshKey],
    queryFn: async () => {
      const [shifts, machines] = await Promise.all([
        fetchAllRows('daftar_shift', '*', (q) => q.gte('tanggal', startDateStr).lte('tanggal', endDateStr)),
        fetchAllRows('master_data_mesin', 'work_center,kategori')
      ]);
      return { shifts: shifts || [], machines: machines || [] };
    },
    staleTime: 5 * 60 * 1000,
  });

  const filteredMachines = useMemo(() => {
    const machines = data?.machines || [];
    return machines.filter(m => {
      const cat = (m.kategori || '').toLowerCase();
      if (activeCategory === 'tubing') return cat === 'tubing';
      if (activeCategory === 'haven') return cat === 'haven';
      return cat !== 'tubing' && cat !== 'haven';
    }).sort((a, b) => (a.work_center || '').localeCompare(b.work_center || ''));
  }, [data?.machines, activeCategory]);

  const shiftMap = useMemo(() => {
    const map = new Map<string, any>();
    (data?.shifts || []).forEach(s => {
      const wc = (s.work_center || '').trim().toUpperCase();
      const date = s.tanggal;
      map.set(`${wc}|${date}`, s);
    });
    return map;
  }, [data?.shifts]);

  const handlePrevWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
    setEditedShifts({});
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
    setEditedShifts({});
  };

  const handleCurrentWeek = () => {
    setCurrentDate(new Date());
    setEditedShifts({});
  };

  const handleEditChange = (key: string, field: 'plan_working_hour', value: string) => {
    setEditedShifts(prev => {
      const existing = prev[key] || { 
        plan_working_hour: shiftMap.get(key)?.plan_working_hour?.toString() || ''
      };
      return {
        ...prev,
        [key]: { ...existing, [field]: value }
      };
    });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, startMachineIdx: number, startDateIdx: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    if (!pasteData) return;

    const rows = pasteData.split(/\r?\n/).map(row => row.split('\t'));
    
    setEditedShifts(prev => {
      const newShifts = { ...prev };
      
      rows.forEach((row, rowIdx) => {
        const machineIdx = startMachineIdx + rowIdx;
        if (machineIdx >= filteredMachines.length) return;
        
        const machine = filteredMachines[machineIdx];
        
        row.forEach((cellValue, colIdx) => {
          const dateIdx = startDateIdx + colIdx;
          if (dateIdx >= datesOfWeek.length) return;
          
          const date = datesOfWeek[dateIdx];
          const dateStr = date.toISOString().split('T')[0];
          const key = `${(machine.work_center || '').trim().toUpperCase()}|${dateStr}`;
          
          const existing = newShifts[key] || {
            plan_working_hour: shiftMap.get(key)?.plan_working_hour?.toString() || ''
          };
          
          // Clean up the pasted value (remove non-numeric characters if needed, or just trim)
          const cleanValue = cellValue.trim();
          
          newShifts[key] = {
            ...existing,
            plan_working_hour: cleanValue
          };
        });
      });
      
      return newShifts;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const toDelete: { work_center: string, tanggal: string }[] = [];
      const toInsert: any[] = [];

      Object.entries(editedShifts).forEach(([key, value]: [string, { plan_working_hour: string }]) => {
        const [work_center, tanggal] = key.split('|');
        const date = new Date(tanggal);
        const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const monthName = monthNames[date.getMonth()];
        const yearStr = date.getFullYear();
        const periode = `${monthName}-${yearStr}`;
        
        // Always delete the old record if it was edited
        toDelete.push({ work_center, tanggal });

        // Only insert if there's actual data
        if (value.plan_working_hour) {
          toInsert.push({
            work_center,
            tanggal,
            plan_working_hour: value.plan_working_hour ? Number(value.plan_working_hour) : null,
            periode
          });
        }
      });

      // Delete existing records for the edited combinations to avoid duplicates or to clear them
      const deletePromises = toDelete.map(d => 
        supabase.from('daftar_shift').delete().match({ work_center: d.work_center, tanggal: d.tanggal })
      );
      await Promise.all(deletePromises);
      
      // Insert new records
      if (toInsert.length > 0) {
        const { error } = await supabase.from('daftar_shift').insert(toInsert);
        if (error) {
          console.error('Supabase insert error:', error);
          throw error;
        }
      }

      setEditedShifts({});
      setIsEditing(false); // Return to view mode
      triggerRefresh();
      queryClient.invalidateQueries({ queryKey: ['daftar_shift_weekly'] });
    } catch (error) {
      console.error('Error saving shifts:', error);
      alert('Gagal menyimpan data: ' + (error as any).message || 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = () => {
    const exportData = filteredMachines.map((machine, index) => {
      const row: any = {
        'No': index + 1,
        'Work Center': machine.work_center || '-',
      };

      datesOfWeek.forEach(date => {
        const dateStr = date.toISOString().split('T')[0];
        const shiftData = shiftMap.get(`${(machine.work_center || '').trim().toUpperCase()}|${dateStr}`);
        const dayName = date.toLocaleDateString('id-ID', { weekday: 'long' });
        const formattedDate = date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
        
        row[`${dayName} (${formattedDate})`] = shiftData ? `${shiftData.plan_working_hour || 0} Jam` : '-';
      });

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Daftar Shift ${activeCategory}`);
    XLSX.writeFile(wb, `Daftar_Shift_${activeCategory}_${startDateStr}_to_${endDateStr}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[calc(100vh-120px)]">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50">
          
          {/* Category Toggle */}
          <div className="flex bg-white rounded-full shadow-sm border border-gray-200 p-1">
            {[
              { id: 'tubing', label: 'Tubing' },
              { id: 'haven', label: 'Haven' },
              { id: 'others', label: 'Others' }
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id as any)}
                className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
                  activeCategory === cat.id
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Week Navigation */}
          <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm border border-gray-200 p-1">
            <button
              onClick={handlePrevWeek}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors text-gray-600"
              title="Minggu Sebelumnya"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleCurrentWeek}
              className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 rounded-md transition-colors text-sm font-bold text-gray-700 border-x border-gray-100"
            >
              <CalendarIcon className="w-4 h-4 text-emerald-600" />
              {datesOfWeek[0].toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - {datesOfWeek[6].toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
            </button>
            <button
              onClick={handleNextWeek}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors text-gray-600"
              title="Minggu Selanjutnya"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => { setIsEditing(false); setEditedShifts({}); }}
                  className="flex items-center px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors shadow-sm"
                >
                  <X className="w-4 h-4 mr-2" />
                  Batal
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Edit2 className="w-4 h-4 mr-2" />
                Edit Data
              </button>
            )}
            <button
              onClick={handleExport}
              className="flex items-center px-4 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Excel
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-[11px] text-left">
            <thead className="text-[11px] text-gray-600 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-2 py-2 font-bold border-b border-gray-200 w-12 text-center">No</th>
                <th className="px-2 py-2 font-bold border-b border-gray-200 min-w-[120px]">Work Center</th>
                {datesOfWeek.map((date, i) => (
                  <th key={i} className="px-2 py-2 font-bold border-b border-gray-200 text-center min-w-[100px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-emerald-700">{date.toLocaleDateString('id-ID', { weekday: 'long' })}</span>
                      <span className="text-gray-500 font-medium">{date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' })}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMachines.length > 0 ? (
                filteredMachines.map((machine, idx) => (
                  <tr key={idx} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="px-2 py-2 text-gray-500 text-center font-medium">{idx + 1}</td>
                    <td className="px-2 py-2 font-bold text-gray-900">{machine.work_center || '-'}</td>
                    {datesOfWeek.map((date, i) => {
                      const dateStr = date.toISOString().split('T')[0];
                      const key = `${(machine.work_center || '').trim().toUpperCase()}|${dateStr}`;
                      const shiftData = shiftMap.get(key);
                      const editedData = editedShifts[key];
                      
                      const displayHours = editedData !== undefined ? editedData.plan_working_hour : (shiftData?.plan_working_hour?.toString() || '');
                      
                      if (isEditing) {
                        return (
                          <td key={i} className="px-1 py-1 text-center border-b border-gray-100">
                            <div className="flex flex-col gap-1">
                              <input 
                                type="number"
                                value={displayHours}
                                onChange={(e) => handleEditChange(key, 'plan_working_hour', e.target.value)}
                                onPaste={(e) => handlePaste(e, idx, i)}
                                className="w-full text-center border border-gray-300 rounded px-1 py-1 text-[11px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                placeholder="Jam"
                              />
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td key={i} className="px-2 py-2 text-center border-b border-gray-100">
                          {shiftData ? (
                            <div className="flex flex-col items-center justify-center gap-1">
                              <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                {shiftData.plan_working_hour || 0} Jam
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-300 font-medium">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={datesOfWeek.length + 2} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <CalendarIcon className="w-8 h-8 text-gray-300" />
                      <p>Tidak ada data mesin untuk kategori ini</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
