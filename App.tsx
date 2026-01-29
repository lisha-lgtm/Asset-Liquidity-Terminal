import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { 
  TrendingUp, LayoutDashboard, 
  ArrowUpRight, ArrowDownRight, Wallet, Layers, ChevronDown, ShieldAlert, Upload, FileSpreadsheet
} from 'lucide-react';
import { read, utils } from 'xlsx';

// --- 类型定义 ---
interface DataItem {
  date: Date;
  amount: number;
  category: string;
}

// 初始资金
const INITIAL_BALANCE = 1016000;

// --- 工具函数 ---
// 周划分逻辑: 1-7日=W1, 8-14日=W2, 15-21日=W3, 22日及以后=W4
const getWeekIndex = (day: number) => day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;

const getPeriodNameFromDate = (date: Date, viewType: string) => {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (viewType === 'monthly') return `${y}年${m}月`;
  if (viewType === 'semi-monthly') return `${y}年${m}月 ${getWeekIndex(d) <= 2 ? '上半月' : '下半月'}`;
  return `${y}年${m}月 第${getWeekIndex(d)}周`;
};

const formatCurrency = (val: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(val);

const App = () => {
  const [viewType, setViewType] = useState('weekly');
  const [selectedFilter, setSelectedFilter] = useState('');
  
  // 数据状态
  const [incomes, setIncomes] = useState<DataItem[]>([]);
  const [expenses, setExpenses] = useState<DataItem[]>([]);
  const [emergencyFunds, setEmergencyFunds] = useState<DataItem[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  
  // 拖拽相关状态
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 文件上传处理
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = read(arrayBuffer, { cellDates: true }); 

      const parseSheet = (sheetName: string): DataItem[] => {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return [];
        
        // 使用 header: 1 读取为二维数组，方便按索引取列
        const rows = utils.sheet_to_json<any[]>(sheet, { header: 1 });
        
        // 跳过表头 (假设第一行是表头)
        return rows.slice(1).map(row => {
          // C列: 归属日期 (索引 2)
          let dateCell = row[2];
          let date: Date | null = null;
          
          if (dateCell instanceof Date) {
             // 关键修正：给日期加12小时，防止因时区差异导致日期回退一天
             date = new Date(dateCell.getTime() + 12 * 60 * 60 * 1000);
          } else if (typeof dateCell === 'string' || typeof dateCell === 'number') {
             const parsed = new Date(dateCell);
             if (!isNaN(parsed.getTime())) {
                date = new Date(parsed.getTime() + 12 * 60 * 60 * 1000);
             }
          }

          if (!date || isNaN(date.getTime())) return null;

          // E列: 摘要明细 (索引 4)
          const category = row[4] || '未分类';
          
          // I列: 人民币金额 (索引 8)
          const amount = typeof row[8] === 'number' ? row[8] : parseFloat(row[8]) || 0;

          return { date, category, amount };
        }).filter(item => item !== null) as DataItem[];
      };

      const loadedIncomes = parseSheet('收入明细');
      const loadedExpenses = parseSheet('支出明细');
      const loadedEmergency = parseSheet('紧急备用金');

      setIncomes(loadedIncomes);
      setExpenses(loadedExpenses);
      setEmergencyFunds(loadedEmergency);
      setIsDataLoaded(true);

    } catch (error) {
      console.error("解析 Excel 失败:", error);
      alert("解析文件失败，请确保文件格式正确且包含指定的 Sheet (收入明细, 支出明细, 紧急备用金)");
    }
  };

  // 1. 生成周流水
  const weeklyFullData = useMemo(() => {
    const allDates = [...incomes, ...expenses, ...emergencyFunds].map(d => d.date);
    if (allDates.length === 0) return [];
    
    // @ts-ignore
    const minDate = new Date(Math.min(...allDates));
    // @ts-ignore
    const maxDate = new Date(Math.max(...allDates, new Date().getTime()));
    
    const weeks = [];
    let curr = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    
    if (end.getFullYear() - curr.getFullYear() > 10) {
        return [];
    }

    while (curr <= end) {
      const y = curr.getFullYear();
      const m = curr.getMonth() + 1;
      for (let w = 1; w <= 4; w++) {
        weeks.push({ year: y, month: m, week: w, key: `${y}-${m.toString().padStart(2, '0')}-W${w}`, income: 0, expense: 0, emergencyFund: 0 });
      }
      curr.setMonth(curr.getMonth() + 1);
    }

    const populate = (items: DataItem[], field: 'income' | 'expense' | 'emergencyFund') => {
      items.forEach(item => {
        if (field === 'income' && (item.category.includes('期初余额') || item.category.includes('现金备用'))) return;
        const key = `${item.date.getFullYear()}-${(item.date.getMonth() + 1).toString().padStart(2, '0')}-W${getWeekIndex(item.date.getDate())}`;
        // @ts-ignore
        const target = weeks.find(w => w.key === key);
        // @ts-ignore
        if (target) target[field] += item.amount;
      });
    };

    populate(incomes, 'income');
    populate(expenses, 'expense');
    populate(emergencyFunds, 'emergencyFund');

    let bal = INITIAL_BALANCE;
    // @ts-ignore
    return weeks.map(w => {
      const opening = bal;
      // @ts-ignore
      const closing = opening + w.income - w.expense;
      bal = closing;
      // @ts-ignore
      return { ...w, opening, closing, name: `${w.year}年${w.month}月 第${w.week}周` };
    });
  }, [incomes, expenses, emergencyFunds]);

  // 2. 聚合逻辑
  const aggregatedData = useMemo(() => {
    if (viewType === 'weekly') return weeklyFullData;
    const map: any = {};
    weeklyFullData.forEach((w: any) => {
      const isSemi = viewType === 'semi-monthly';
      // 这里的逻辑基于 getWeekIndex 的返回值 (1,2,3,4)
      // 上半月 = W1 (1-7日) + W2 (8-14日)
      // 下半月 = W3 (15-21日) + W4 (22日及以后)
      const sub = isSemi ? (w.week <= 2 ? '上半月' : '下半月') : '';
      const key = isSemi ? `${w.year}-${w.month}-${sub}` : `${w.year}-${w.month}`;
      if (!map[key]) {
        map[key] = { name: isSemi ? `${w.year}年${w.month}月 ${sub}` : `${w.year}年${w.month}月`, year: w.year, month: w.month, subType: sub, income: 0, expense: 0, emergencyFund: 0, opening: w.opening, weeks: [] };
      }
      map[key].income += w.income;
      map[key].expense += w.expense;
      map[key].weeks.push(w);
    });
    return Object.values(map).map((it: any) => {
      let efValue = 0;
      if (viewType === 'semi-monthly') {
        if (it.subType === '上半月') {
          // 上半月取第2周的紧急备用金
          // @ts-ignore
          const w2 = weeklyFullData.find(w => w.year === it.year && w.month === it.month && w.week === 2);
          efValue = w2 ? w2.emergencyFund : 0;
        } else if (it.subType === '下半月') {
          // 下半月取第4周的紧急备用金
          // @ts-ignore
          const w4 = weeklyFullData.find(w => w.year === it.year && w.month === it.month && w.week === 4);
          efValue = w4 ? w4.emergencyFund : 0;
        }
      } else if (viewType === 'monthly') {
        // 月度取第4周的紧急备用金
        // @ts-ignore
        const w4 = weeklyFullData.find(w => w.year === it.year && w.month === it.month && w.week === 4);
        efValue = w4 ? w4.emergencyFund : 0;
      }
      return { ...it, emergencyFund: efValue, closing: it.weeks[it.weeks.length - 1].closing, net: it.income - it.expense };
    });
  }, [weeklyFullData, viewType]);

  useEffect(() => {
    if (aggregatedData.length > 0) {
        const todayName = getPeriodNameFromDate(new Date(), viewType);
        const exists = aggregatedData.some((d: any) => d.name === todayName);
        if (exists) {
            setSelectedFilter(todayName);
        } else {
            // @ts-ignore
            setSelectedFilter(aggregatedData[aggregatedData.length - 1].name);
        }
    }
  }, [viewType, isDataLoaded, aggregatedData]);

  const displayBlocks = useMemo(() => {
    if (!isDataLoaded) return [];
    // @ts-ignore
    const idx = aggregatedData.findIndex(d => d.name === selectedFilter);
    if (idx === -1) return aggregatedData.slice(-4); 
    return aggregatedData.slice(idx, idx + 4); 
  }, [aggregatedData, selectedFilter, isDataLoaded]);

  // --- 拖拽逻辑实现 ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !isDataLoaded) return;
    setDragStartX(e.clientX);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || dragStartX === null || !isDataLoaded) return;
    
    const currentX = e.clientX;
    const diff = currentX - dragStartX;
    const threshold = 100;

    if (Math.abs(diff) > threshold) {
      // @ts-ignore
      const currentIndex = aggregatedData.findIndex(d => d.name === selectedFilter);
      
      if (diff > 0) {
        if (currentIndex > 0) {
          // @ts-ignore
          setSelectedFilter(aggregatedData[currentIndex - 1].name);
        }
      } else {
        if (currentIndex < aggregatedData.length - 1) {
          // @ts-ignore
          setSelectedFilter(aggregatedData[currentIndex + 1].name);
        }
      }
      setDragStartX(currentX);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStartX(null);
  };

  if (!isDataLoaded) {
    return (
      <div className="min-h-screen bg-[#0A0C10] text-slate-200 flex flex-col items-center justify-center p-4">
         <div className="max-w-md w-full bg-[#11141D] rounded-3xl border border-slate-800 p-8 text-center shadow-2xl">
            <div className="mx-auto w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6 border border-indigo-500/20">
                <FileSpreadsheet className="text-indigo-400" size={32} />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">上传财务数据源</h2>
            <p className="text-slate-500 text-sm mb-8">
              请上传包含 "收入明细"、"支出明细" 及 "紧急备用金" Sheet 的 Excel 文件 (.xlsx)。系统将自动提取 C列(归属日期)、E列(摘要明细) 及 I列(人民币金额)。
            </p>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".xlsx, .xls" 
              className="hidden" 
            />
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 group"
            >
              <Upload size={18} className="group-hover:-translate-y-0.5 transition-transform" />
              选择文件上传
            </button>
         </div>
         <p className="mt-8 text-slate-600 text-xs font-mono">SECURE TERMINAL // WAITING FOR INPUT</p>
      </div>
    )
  }

  return (
    <div 
      className={`min-h-screen bg-[#0A0C10] text-slate-200 p-4 md:p-8 font-sans selection:bg-indigo-500 selection:text-white transition-all duration-300 select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* 顶部控制台 */}
      <div className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row md:items-start justify-between gap-8 relative">
        <div className="z-10">
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-4">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl shadow-2xl shadow-indigo-500/20 text-white">
              <LayoutDashboard size={24} />
            </div>
            资产流动性监控终端
          </h1>
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/40 border border-slate-700/30 rounded-lg backdrop-blur-md text-amber-500 font-bold">
              <ShieldAlert size={12} />
              <span className="text-[9px] uppercase tracking-wider font-black">Accrual Fund Tracker</span>
            </div>
            <p className="text-slate-500 text-[11px] font-bold border-l border-slate-800 pl-4 italic">
              初始注入: {formatCurrency(INITIAL_BALANCE)}
            </p>
            <button 
                onClick={() => { setIsDataLoaded(false); setIncomes([]); setExpenses([]); }}
                className="ml-auto flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 font-bold bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20 cursor-pointer z-50 pointer-events-auto"
                onMouseDown={(e) => e.stopPropagation()} // 防止触发拖拽
            >
                <Upload size={10} /> 重新上传
            </button>
          </div>
        </div>

        {/* 右上角筛选器 */}
        <div className="md:absolute md:top-0 md:right-0 flex flex-col sm:flex-row gap-2 p-1 bg-slate-900/50 border border-slate-800/50 rounded-[1.25rem] backdrop-blur-3xl shadow-2xl z-30" onMouseDown={(e) => e.stopPropagation()}>
          <div className="relative group">
            <select value={viewType} onChange={(e) => setViewType(e.target.value)} className="appearance-none bg-[#11141D] hover:bg-[#1A1F2B] border border-slate-700 px-4 py-2.5 pr-10 rounded-xl text-[10px] font-black text-slate-300 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer w-full sm:w-36 outline-none">
              <option value="weekly">周报监控</option>
              <option value="semi-monthly">半月监控</option>
              <option value="monthly">月度监控</option>
            </select>
            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
          <div className="relative group">
            <select value={selectedFilter} onChange={(e) => setSelectedFilter(e.target.value)} className="appearance-none bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 px-4 py-2.5 pr-10 rounded-xl text-[10px] font-black text-indigo-400 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer w-full sm:w-56 outline-none">
              {/* @ts-ignore */}
              {aggregatedData.map((d, i) => <option key={i} value={d.name}>{d.name}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 四个板块卡片展示 */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12 pointer-events-none">
        {/* @ts-ignore */}
        {displayBlocks.map((period, index) => {
          const isSelected = period.name === selectedFilter;
          const todayName = getPeriodNameFromDate(new Date(), viewType);
          const isToday = period.name === todayName;

          // 特定高亮逻辑：Jan W4 至 Feb W3 背景样式一致
          const isSpecialHighlight = [
            '2026年1月 第4周', 
            '2026年2月 第1周', 
            '2026年2月 第2周', 
            '2026年2月 第3周'
          ].includes(period.name);
          
          const shouldUseHighStyle = isSelected || isSpecialHighlight;

          return (
            <div key={index} className={`relative bg-[#11141D] rounded-[1.5rem] p-5 border ${isSelected ? 'border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.08)]' : 'border-slate-800/60'} transition-all duration-700 group flex flex-col`}>
              <div className="flex flex-wrap items-center justify-start gap-3 mb-4">
                <span className={`font-black rounded-full uppercase tracking-[0.15em] transition-all duration-500 text-[11px] px-4 py-1.5 shadow-[0_5px_15px_rgba(0,0,0,0.3)] ring-1 shrink-0
                  ${shouldUseHighStyle ? 'text-white bg-indigo-600 shadow-[0_0_20px_rgba(99,102,241,0.4)] ring-1 ring-indigo-400/40' : 'text-indigo-400 bg-indigo-500/10 ring-indigo-500/20'}
                `}>
                  {period.name}
                </span>

                <div className="flex gap-1.5 shrink-0">
                  {isToday && (
                     <div className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 text-[9px] font-black rounded border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)] uppercase">Today</div>
                  )}
                  {period.emergencyFund > 0 && (
                    <div className="px-2.5 py-1 bg-amber-500/20 text-amber-500 text-[9px] font-black rounded border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)] uppercase tracking-wider">Fund Mapped</div>
                  )}
                </div>
              </div>

              <div className="mb-5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,1)] ${shouldUseHighStyle ? 'w-1.5 h-1.5' : 'w-1 h-1'}`}></span>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">期末结余 (Closing)</p>
                </div>
                <h2 className={`text-2xl font-black tracking-tighter transition-colors ${period.closing >= 0 ? (shouldUseHighStyle ? 'text-white' : 'text-slate-200') : 'text-rose-500'}`}>
                  {formatCurrency(period.closing)}
                </h2>
              </div>

              <div className="space-y-2.5 pt-4 border-t border-slate-800/50 mt-auto text-[10px]">
                <div className="flex items-center justify-between text-slate-500 font-bold">
                  <span>期初余额</span>
                  <span className="text-slate-400 tracking-tight">{formatCurrency(period.opening)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <ArrowUpRight size={12} className="text-emerald-500/50" />
                     <span className="font-bold text-slate-300">期间流入</span>
                  </div>
                  <span className="font-black text-emerald-400">+{formatCurrency(period.income)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <ArrowDownRight size={12} className="text-rose-500/50" />
                     <span className="font-bold text-slate-300">期间流出</span>
                  </div>
                  <span className="font-black text-rose-400">-{formatCurrency(period.expense)}</span>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/30">
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={12} className={period.emergencyFund > 0 ? 'text-amber-500' : 'text-slate-600'} />
                    <span className="font-bold text-slate-400">紧急备用金</span>
                  </div>
                  <span className={`font-black ${period.emergencyFund > 0 ? 'text-amber-500' : 'text-slate-800'}`}>
                    {formatCurrency(period.emergencyFund)}
                  </span>
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 w-full h-0.5 ${shouldUseHighStyle ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,1)]' : 'bg-transparent'} transition-all`}></div>
            </div>
          );
        })}
      </div>

      {/* 趋势与总结区 */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16 pointer-events-none">
        <div className="lg:col-span-2 bg-[#11141D] p-10 rounded-[2.5rem] border border-slate-800/60 shadow-2xl relative overflow-hidden group">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">资金存量滚动全景</h3>
              <p className="text-[9px] font-black text-slate-500 mt-1 uppercase tracking-[0.2em] italic text-center md:text-left">Portfolio Analytics / 单位：万</p>
            </div>
            <div className="p-3 bg-slate-800 rounded-xl border border-slate-700 hover:bg-slate-700 transition-colors">
              <TrendingUp size={18} className="text-indigo-400" />
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              {/* @ts-ignore */}
              <AreaChart data={aggregatedData}>
                <defs>
                  <linearGradient id="colorClosing" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1F2937" />
                <XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={false} tick={{fill: '#4B5563', fontWeight: 800}} dy={10} hide={aggregatedData.length > 20} />
                <YAxis fontSize={9} tickLine={false} axisLine={false} tickFormatter={(val: number) => `${(val/10000).toFixed(0)}万`} tick={{fill: '#4B5563', fontWeight: 800}} dx={-5} />
                <Tooltip cursor={{ stroke: '#6366f1', strokeWidth: 1 }} contentStyle={{ backgroundColor: '#0A0C10', border: '1px solid #374151', borderRadius: '1rem', padding: '12px' }} itemStyle={{ color: '#818CF8', fontWeight: '900', fontSize: '12px' }} />
                <Area type="monotone" dataKey="closing" name="存量结余" stroke="#6366f1" strokeWidth={4} fill="url(#colorClosing)" dot={{r: 3, fill: '#6366f1', strokeWidth: 2, stroke: '#0A0C10'}} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden shadow-2xl flex-1 flex flex-col justify-center">
            <div className="relative z-10 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-4 text-indigo-100/50 uppercase tracking-[0.2em] font-black text-[9px]">
                <Wallet size={16} />
                Aggregate Balance
              </div>
              <p className="text-4xl font-black tracking-tighter mb-4 leading-none">
                {formatCurrency(aggregatedData.length > 0 ? aggregatedData[aggregatedData.length - 1].closing : 0)}
              </p>
              <div className="flex justify-center md:justify-start">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-[9px] font-black tracking-widest border border-white/10 backdrop-blur-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  AUDITED POOL
                </div>
              </div>
            </div>
            <Layers size={140} className="absolute -bottom-10 -right-10 text-white/5 rotate-12 pointer-events-none" />
          </div>
          <div className="bg-[#11141D] border border-slate-800 rounded-[2rem] p-8 relative flex flex-col justify-center overflow-hidden border-l-amber-500/40 shadow-xl">
             <div className="flex items-center gap-3 mb-3">
              <ShieldAlert size={18} className="text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
              <h4 className="text-xs font-black text-white tracking-tight uppercase tracking-widest">操作指南</h4>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed font-bold italic">
              "按住鼠标左键左右滑动屏幕即可快速切换时间区间。所有期间标签已同步放大，系统根据 W2/W4 自动进行风险准备金映射。"
            </p>
          </div>
        </div>
      </div>

      {/* 审计流水表 - 这里的点击不触发拖拽切换，方便查看数据 */}
      <div className="max-w-7xl mx-auto bg-[#11141D] rounded-[2.5rem] border border-slate-800/60 overflow-hidden mb-16 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-10 py-7 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-black text-white text-xl tracking-tight flex items-center gap-3">
            归属审计全量流水表
            <span className="text-[10px] font-bold text-slate-600 tracking-widest uppercase ml-2 px-2 py-0.5 bg-slate-900 rounded-md border border-slate-800">Verified Database</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900/30 text-slate-500 font-black">
                <th className="px-10 py-6 text-[10px] uppercase tracking-widest">统计期间 (归属)</th>
                <th className="px-10 py-6 text-[10px] uppercase tracking-widest text-right">期间期初</th>
                <th className="px-10 py-6 text-[10px] uppercase tracking-widest text-right">经营流入</th>
                <th className="px-10 py-6 text-[10px] uppercase tracking-widest text-right">经营流出</th>
                <th className="px-10 py-6 text-[10px] text-amber-500/80 uppercase tracking-widest text-right">紧急备用金</th>
                <th className="px-10 py-6 text-[10px] uppercase tracking-widest text-right">期末结余</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30 text-[11px]">
              {/* @ts-ignore */}
              {aggregatedData.map((item, idx) => (
                <tr key={idx} className={`group hover:bg-slate-800/40 transition-colors ${item.name === selectedFilter ? 'bg-indigo-500/5' : ''}`}>
                  <td className={`px-10 py-6 font-black group-hover:text-indigo-400 transition-all ${item.name === selectedFilter ? 'text-indigo-400' : 'text-slate-300'}`}>{item.name}</td>
                  <td className="px-10 py-6 text-right text-slate-500 font-bold">{formatCurrency(item.opening)}</td>
                  <td className="px-10 py-6 text-right text-emerald-400 font-black">{formatCurrency(item.income)}</td>
                  <td className="px-10 py-6 text-right text-rose-500 font-black">{formatCurrency(item.expense)}</td>
                  <td className={`px-10 py-6 text-right font-black ${item.emergencyFund > 0 ? 'text-amber-500' : 'text-slate-800/40'}`}>
                    {formatCurrency(item.emergencyFund)}
                  </td>
                  <td className={`px-10 py-6 text-right font-black text-lg tracking-tighter ${item.closing >= INITIAL_BALANCE ? 'text-white' : 'text-rose-500'}`}>
                    {formatCurrency(item.closing)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default App;