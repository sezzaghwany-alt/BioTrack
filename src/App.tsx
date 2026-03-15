/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Activity, 
  ShieldAlert, 
  Layers, 
  MapPin, 
  Thermometer, 
  Wind, 
  AlertTriangle,
  ChevronRight,
  Info,
  PlusCircle,
  History,
  LayoutDashboard,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Download,
  Filter,
  Search,
  BrainCircuit,
  LogIn,
  LogOut,
  User as UserIcon,
  FileSpreadsheet,
  Upload,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  BarChart,
  Bar
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from "@google/genai";
import { supabase } from './lib/supabase';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

type ControlType = 'Actif' | 'Passif' | 'Surface';
type ZoneClass = 'C' | 'D';
type Status = 'C' | 'Alerte' | 'NCF';
type UserRole = 'admin' | 'user';

interface Limit {
  alert: number;
  action: number;
}

interface Measurement {
  id: string;
  date: string;
  zone: ZoneClass;
  type: ControlType;
  point: string;
  value: number;
  status: Status;
  created_by?: string;
}

interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
}

// --- Constants ---

const LIMITS: Record<ZoneClass, Record<ControlType, Limit>> = {
  C: {
    Actif: { alert: 30, action: 50 },
    Passif: { alert: 15, action: 25 },
    Surface: { alert: 8, action: 13 },
  },
  D: {
    Actif: { alert: 60, action: 100 },
    Passif: { alert: 30, action: 50 },
    Surface: { alert: 15, action: 25 },
  }
};

const POINTS: Record<ZoneClass, Record<ControlType, string[]>> = {
  C: {
    Actif: ['A17', 'A18', 'A19', 'A20', 'A21', 'A22'],
    Passif: ['P18', 'P19', 'P20', 'P21', 'P22'],
    Surface: Array.from({ length: 14 }, (_, i) => `S${46 + i}`),
  },
  D: {
    Actif: ['A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16'],
    Passif: ['P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17'],
    Surface: Array.from({ length: 27 }, (_, i) => `S${19 + i}`),
  }
};

// --- Components ---

const StatCard = ({ title, value, icon: Icon, color }: { title: string, value: string | number, icon: any, color: string }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
    <div className="flex items-center justify-between mb-4">
      <div className={cn("p-2 rounded-lg", color)}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
    <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
    <p className="text-3xl font-bold text-slate-900">{value}</p>
  </div>
);

export default function App() {
  const [view, setView] = useState<'dashboard' | 'entry' | 'history'>('dashboard');
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiInterpretation, setAiInterpretation] = useState<string | null>(null);
  const [showConfigWarning, setShowConfigWarning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      setShowConfigWarning(true);
    }
  }, []);

  // --- Supabase Sync ---
  useEffect(() => {
    checkUser();
    fetchMeasurements();
    
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email!,
          role: (session.user.user_metadata?.role as UserRole) || 'user'
        });
      } else {
        setUser(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser({
        id: session.user.id,
        email: session.user.email!,
        role: (session.user.user_metadata?.role as UserRole) || 'user'
      });
    }
    setLoading(false);
  };

  const fetchMeasurements = async () => {
    const { data, error } = await supabase
      .from('measurements')
      .select('*')
      .order('date', { ascending: false });
    
    if (data) setMeasurements(data);
    else if (error) console.error('Error fetching data:', error);
  };

  // --- Auth Handlers ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegistering) {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: { data: { role: 'user' } }
        });
        if (error) throw error;
        alert('Inscription réussie ! Vérifiez vos emails.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // --- Excel Import ---
  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const newMeasurements = data.map(row => {
        const zone = (row.Zone || 'C') as ZoneClass;
        const type = (row.Type || 'Actif') as ControlType;
        const value = parseFloat(row.Valeur || 0);
        const limit = LIMITS[zone][type];
        
        let status: Status = 'C';
        if (value >= limit.action) status = 'NCF';
        else if (value >= limit.alert) status = 'Alerte';

        return {
          date: row.Date ? new Date(row.Date).toISOString() : new Date().toISOString(),
          zone,
          type,
          point: row.Point || 'A17',
          value,
          status,
          created_by: user?.id
        };
      });

      // Save to Supabase
      const { error } = await supabase.from('measurements').insert(newMeasurements);
      if (error) alert('Erreur lors de l\'importation : ' + error.message);
      else {
        alert(`${newMeasurements.length} résultats importés avec succès.`);
        fetchMeasurements();
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- Form State ---
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    zone: 'C' as ZoneClass,
    type: 'Actif' as ControlType,
    point: 'A17',
    value: ''
  });

  // --- Computed Stats ---
  const stats = useMemo(() => {
    const total = measurements.length;
    const ncf = measurements.filter(m => m.status === 'NCF').length;
    const alerte = measurements.filter(m => m.status === 'Alerte').length;
    const complianceRate = total > 0 ? (((total - ncf) / total) * 100).toFixed(1) : 100;

    return { total, ncf, alerte, complianceRate };
  }, [measurements]);

  const trendData = useMemo(() => {
    const last12Months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (11 - i));
      const monthStr = format(d, 'MMM', { locale: fr });
      const monthMeasures = measurements.filter(m => {
        const mDate = parseISO(m.date);
        return mDate.getMonth() === d.getMonth() && mDate.getFullYear() === d.getFullYear();
      });
      
      return {
        name: monthStr,
        avg: monthMeasures.length > 0 
          ? (monthMeasures.reduce((acc, curr) => acc + curr.value, 0) / monthMeasures.length).toFixed(1)
          : 0,
        ncf: monthMeasures.filter(m => m.status === 'NCF').length
      };
    });
    return last12Months;
  }, [measurements]);

  const automaticInterpretation = useMemo(() => {
    if (aiInterpretation) return aiInterpretation;
    const recentNCFs = measurements.filter(m => m.status === 'NCF').slice(-5);
    const recurringPoints = measurements
      .filter(m => m.status !== 'C')
      .reduce((acc, curr) => {
        acc[curr.point] = (acc[curr.point] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    const criticalPoints = Object.entries(recurringPoints)
      .filter(([_, count]) => (count as number) > 2)
      .map(([point]) => point);

    if (criticalPoints.length > 0) {
      return `Alerte Critique : Les points ${criticalPoints.join(', ')} présentent des dérives récurrentes. Une action corrective immédiate est requise sur ces emplacements.`;
    }
    if (recentNCFs.length === 0) {
      return "Système sous contrôle. Aucune anomalie majeure détectée sur les derniers prélèvements. Poursuivre la surveillance standard.";
    }
    return "Vigilance accrue : Quelques dépassements isolés. Surveiller l'efficacité du prochain cycle de nettoyage.";
  }, [measurements, aiInterpretation]);

  const handleAIAnalysis = async () => {
    if (measurements.length === 0) return;
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = "gemini-3-flash-preview";
      
      const dataSummary = measurements.slice(0, 50).map(m => 
        `${format(parseISO(m.date), 'dd/MM')} - Zone ${m.zone} - ${m.type} - Point ${m.point}: ${m.value} UFC (${m.status})`
      ).join('\n');

      const prompt = `En tant qu'expert en microbiologie et contrôle environnemental en zone classée (norme ISO 14644 / BPF), analyse les données suivantes et propose une interprétation concise (max 3-4 phrases) incluant les tendances et les actions correctives potentielles :\n\n${dataSummary}`;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      if (response.text) {
        setAiInterpretation(response.text);
      }
    } catch (err) {
      console.error("AI Analysis failed:", err);
      alert("L'analyse IA a échoué. Vérifiez votre connexion.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const exportToCSV = () => {
    if (measurements.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(measurements);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historique");
    XLSX.writeFile(wb, `BioTrack_Export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  // --- Handlers ---
  const handleAddMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(formData.value);
    if (isNaN(val)) return;

    const limit = LIMITS[formData.zone][formData.type];
    let status: Status = 'C';
    if (val >= limit.action) status = 'NCF';
    else if (val >= limit.alert) status = 'Alerte';

    const newMeasure: Partial<Measurement> = {
      date: new Date(formData.date).toISOString(),
      zone: formData.zone,
      type: formData.type,
      point: formData.point,
      value: val,
      status,
      created_by: user?.id
    };

    const { error } = await supabase.from('measurements').insert([newMeasure]);
    if (error) alert('Erreur : ' + error.message);
    else {
      setFormData({ ...formData, value: '' });
      fetchMeasurements();
      setView('history');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-indigo-200">
              <Activity className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">BioTrack Pro</h1>
            <p className="text-slate-500 text-sm">Gestion de la Surveillance Environnementale</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Email</label>
              <input 
                type="email" 
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="votre@email.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mot de passe</label>
              <input 
                type="password" 
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
            </div>
            <button 
              type="submit"
              className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
            >
              {isRegistering ? <UserIcon className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
              {isRegistering ? "Créer un compte" : "Se connecter"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              {isRegistering ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? S'inscrire"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {showConfigWarning && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md bg-amber-50 border border-amber-200 p-4 rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <h4 className="font-bold text-amber-900 text-sm">Configuration Requise</h4>
              <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                Supabase n'est pas encore configuré. L'application utilise des données locales temporaires. 
                Veuillez ajouter <strong>VITE_SUPABASE_URL</strong> et <strong>VITE_SUPABASE_ANON_KEY</strong> dans vos variables d'environnement.
              </p>
              <button 
                onClick={() => setShowConfigWarning(false)}
                className="mt-2 text-xs font-bold text-amber-900 hover:underline"
              >
                Ignorer pour l'instant
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
          <div className="p-6 flex items-center gap-3 border-b border-slate-800">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">BioTrack Pro</span>
          </div>
          
          <nav className="flex-1 p-4 space-y-2">
            <button 
              onClick={() => setView('dashboard')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                view === 'dashboard' ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <LayoutDashboard className="w-5 h-5" /> Dashboard
            </button>
            <button 
              onClick={() => setView('entry')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                view === 'entry' ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <PlusCircle className="w-5 h-5" /> Saisie Résultats
            </button>
            <button 
              onClick={() => setView('history')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                view === 'history' ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <History className="w-5 h-5" /> Historique
            </button>
          </nav>

          <div className="p-6 border-t border-slate-800 space-y-4">
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">
                {user.email[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{user.email}</p>
                <p className="text-[10px] text-slate-500 uppercase font-bold">{user.role}</p>
              </div>
              <button onClick={handleLogout} className="text-slate-500 hover:text-rose-400">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10">
            <h2 className="font-bold text-slate-800 capitalize">
              {view === 'dashboard' ? 'Tableau de Bord' : view === 'entry' ? 'Nouvelle Saisie' : 'Historique'}
            </h2>
            <div className="flex items-center gap-4">
              {view === 'history' && (
                <button 
                  onClick={exportToCSV}
                  className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-bold transition-all"
                >
                  <Download className="w-4 h-4" /> Exporter
                </button>
              )}
              {user.role === 'admin' && (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-all"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Import Excel
                </button>
              )}
              <input type="file" ref={fileInputRef} onChange={handleExcelImport} className="hidden" accept=".xlsx, .xls" />
            </div>
          </header>

          <div className="p-8 max-w-6xl mx-auto">
            <AnimatePresence mode="wait">
              {view === 'dashboard' && (
                <motion.div 
                  key="dashboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <StatCard title="Total Prélèvements" value={stats.total} icon={Layers} color="bg-blue-50 text-blue-600" />
                    <StatCard title="Taux de Conformité" value={`${stats.complianceRate}%`} icon={CheckCircle2} color="bg-emerald-50 text-emerald-600" />
                    <StatCard title="Alertes (Vigilance)" value={stats.alerte} icon={AlertTriangle} color="bg-amber-50 text-amber-600" />
                    <StatCard title="NCF (Action)" value={stats.ncf} icon={XCircle} color="bg-rose-50 text-rose-600" />
                  </div>

                    <div className="bg-indigo-900 text-white p-6 rounded-2xl shadow-lg flex items-start gap-4 relative overflow-hidden">
                      <div className="p-3 bg-white/10 rounded-xl">
                        <BrainCircuit className="w-6 h-6 text-indigo-300" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-lg">Analyse Prédictive & Interprétation</h3>
                          <button 
                            onClick={handleAIAnalysis}
                            disabled={isAnalyzing}
                            className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-all flex items-center gap-2 disabled:opacity-50"
                          >
                            {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
                            {aiInterpretation ? "Réanalyser" : "Analyse IA"}
                          </button>
                        </div>
                        <p className="text-indigo-100 leading-relaxed text-sm">{automaticInterpretation}</p>
                      </div>
                      {isAnalyzing && (
                        <motion.div 
                          initial={{ x: '-100%' }}
                          animate={{ x: '100%' }}
                          transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                          className="absolute bottom-0 left-0 h-1 w-full bg-indigo-400/50"
                        />
                      )}
                    </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-indigo-500" /> Tendance Moyenne (UFC)
                      </h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                            <Line type="monotone" dataKey="avg" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, fill: '#4f46e5' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <XCircle className="w-5 h-5 text-rose-500" /> Non-Conformités Mensuelles
                      </h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                            <Bar dataKey="ncf" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {view === 'entry' && (
                <motion.div 
                  key="entry"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-2xl mx-auto bg-white p-8 rounded-3xl border border-slate-200 shadow-xl"
                >
                  <form onSubmit={handleAddMeasurement} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Date</label>
                        <input type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Zone</label>
                        <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.zone} onChange={(e) => setFormData({...formData, zone: e.target.value as ZoneClass, point: POINTS[e.target.value as ZoneClass][formData.type][0]})}>
                          <option value="C">Classe C</option>
                          <option value="D">Classe D</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Type</label>
                        <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value as ControlType, point: POINTS[formData.zone][e.target.value as ControlType][0]})}>
                          <option value="Actif">Actif</option>
                          <option value="Passif">Passif</option>
                          <option value="Surface">Surface</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Point</label>
                        <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.point} onChange={(e) => setFormData({...formData, point: e.target.value})}>
                          {POINTS[formData.zone][formData.type].map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Résultat (UFC)</label>
                      <input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-2xl font-mono focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.value} onChange={(e) => setFormData({...formData, value: e.target.value})} required />
                    </div>

                    <button type="submit" className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg transition-all flex items-center justify-center gap-2">
                      <PlusCircle className="w-5 h-5" /> Enregistrer
                    </button>
                  </form>
                </motion.div>
              )}

              {view === 'history' && (
                <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                          <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Zone</th>
                          <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                          <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Point</th>
                          <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Valeur</th>
                          <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {measurements.map((m) => (
                          <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="p-4 text-sm text-slate-600 font-medium">{format(parseISO(m.date), 'dd/MM/yyyy')}</td>
                            <td className="p-4 text-sm text-slate-900 font-bold">Classe {m.zone}</td>
                            <td className="p-4 text-sm text-slate-600">{m.type}</td>
                            <td className="p-4 text-sm font-mono text-slate-600">{m.point}</td>
                            <td className="p-4 text-sm font-mono text-slate-900 font-bold text-right">{m.value} UFC</td>
                            <td className="p-4 text-center">
                              <span className={cn(
                                "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                m.status === 'C' ? "bg-emerald-100 text-emerald-700" : 
                                m.status === 'Alerte' ? "bg-amber-100 text-amber-700" : 
                                "bg-rose-100 text-rose-700"
                              )}>
                                {m.status === 'C' ? 'Conforme' : m.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
