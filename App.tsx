
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BusinessConfig, SavedWidget, AppTab, LeadRecord, ManualPriceItem 
} from './types';
import AIWidget from './components/AIWidget';
import { 
  supabase, isSupabaseConfigured, updateSupabaseConfig, 
  getSupabaseConfig 
} from './services/supabaseClient';

const INITIAL_CONFIG: BusinessConfig = {
  name: 'SwiftFix Handyman',
  primaryColor: '#f97316',
  headerTitle: 'HandyBot AI',
  headerSubtitle: 'Instant Estimates',
  profilePic: 'https://images.unsplash.com/photo-1581578731548-c64695cc6958?q=80&w=256&h=256&auto=format&fit=crop',
  hoverTitle: 'Get a Quote',
  widgetIcon: 'wrench',
  services: ['Plumbing', 'Electrical', 'Painting', 'General'],
  pricingRules: 'Labor: $95/hr. Minimum: $150. Materials: Cost + 20%.',
  systemPrompt: 'You are a highly skilled professional handyman consultant. You are helpful, precise, and polite. When giving estimates, explain the reasoning behind the costs to build trust with the client. Always look for ways to add value by recommending preventative maintenance.',
  googleSheetUrl: '',
  useSheetData: false,
  pricingSource: 'manual',
  corePricingItems: [],
  smartAddons: [],
  manualPriceList: [],
  suggestedQuestions: ['Cost to fix a leak?', 'TV Mounting price?'],
  leadGenConfig: {
    enabled: true,
    destination: 'all',
    targetEmail: '',
    resendApiKey: '', 
    webhookUrl: '',
    googleSheetWebhookUrl: '',
    slackWebhookUrl: '',
    fields: {
      name: { visible: true, required: true },
      email: { visible: true, required: true },
      phone: { visible: true, required: true },
      notes: { visible: true, required: false },
      serviceType: { visible: true, required: false },
      date: { visible: true, required: false },
      time: { visible: true, required: false },
    }
  },
  defaultLanguage: 'en',
};

const App: React.FC = () => {
  const [config, setConfig] = useState<BusinessConfig>(INITIAL_CONFIG);
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [savedWidgets, setSavedWidgets] = useState<SavedWidget[]>([]);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
  const [cloudEnabled, setCloudEnabled] = useState(isSupabaseConfigured());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);

  const [tempUrl, setTempUrl] = useState(getSupabaseConfig().url || '');
  const [tempKey, setTempKey] = useState(getSupabaseConfig().key || '');

  const checkGeminiKey = async () => {
    if ((window as any).aistudio?.hasSelectedApiKey) {
      const selected = await (window as any).aistudio.hasSelectedApiKey();
      setHasGeminiKey(selected);
    }
  };

  const handleOpenKey = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasGeminiKey(true);
    }
  };

  useEffect(() => {
    checkGeminiKey();
  }, []);

  const fetchWidgets = async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const { data, error } = await supabase.from('widgets').select('*').order('updated_at', { ascending: false });
      if (!error) setSavedWidgets(data || []);
    } catch (e) {
      console.error("Error fetching widgets:", e);
    }
  };

  const fetchLeads = async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
      if (!error) setLeads(data || []);
    } catch (e) {
      console.error("Error fetching leads:", e);
    }
  };

  const handleConnect = () => {
    try {
      if (!tempUrl || !tempKey) return alert("Please enter both URL and Key");
      updateSupabaseConfig(tempUrl, tempKey);
      setCloudEnabled(true);
      fetchWidgets();
      fetchLeads();
      alert("Database connected successfully!");
    } catch (e: any) {
      alert("Connection failed: " + e.message);
    }
  };

  useEffect(() => { 
    if (cloudEnabled) {
      fetchWidgets();
      fetchLeads();
    }
  }, [cloudEnabled]);

  const parseCSVLine = (line: string) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else cur += char;
    }
    result.push(cur.trim());
    return result;
  };

  const transformToCsvUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('/export?format=csv')) return url;
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
    }
    return url;
  };

  const syncSheetData = async () => {
    let targetUrl = transformToCsvUrl(config.googleSheetUrl);
    if (!targetUrl) return alert("Please enter a valid Google Sheet URL.");
    
    setIsSyncing(true);
    try {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        if (response.status === 404) throw new Error("Sheet not found. Check the URL.");
        throw new Error("Cannot access sheet. IMPORTANT: Set the sheet sharing to 'Anyone with the link can view'.");
      }
      
      const csvText = await response.text();
      const lines = csvText.split('\n').filter(l => l.trim() !== '');
      if (lines.length < 2) throw new Error("Sheet seems empty or improperly formatted.");

      const newCore: ManualPriceItem[] = [];
      const newAddons: ManualPriceItem[] = [];

      const headers = parseCSVLine(lines[0] || '').map(h => h.toLowerCase());
      const typeIdx = Math.max(headers.indexOf('type'), 0);
      const labelIdx = headers.indexOf('label') !== -1 ? headers.indexOf('label') : 1;
      const priceIdx = headers.indexOf('price') !== -1 ? headers.indexOf('price') : 2;
      const descIdx = headers.indexOf('description') !== -1 ? headers.indexOf('description') : 3;

      for (let i = 1; i < lines.length; i++) {
        const columns = parseCSVLine(lines[i]);
        if (columns.length < 2) continue;

        const type = (columns[typeIdx] || '').toLowerCase();
        const item: ManualPriceItem = {
          id: `sheet-${i}-${Date.now()}`,
          label: columns[labelIdx] || 'Unnamed Item',
          price: columns[priceIdx] || '$0',
          description: columns[descIdx] || ''
        };

        if (type.includes('core') || type.includes('service') || type.includes('main')) {
          newCore.push(item);
        } else {
          newAddons.push(item);
        }
      }

      setConfig(prev => ({
        ...prev,
        googleSheetUrl: targetUrl,
        corePricingItems: newCore,
        smartAddons: newAddons,
        useSheetData: true
      }));
      setLastSyncTime(new Date().toLocaleTimeString());
      alert(`Synced Successfully! Found ${newCore.length} Core items and ${newAddons.length} Add-ons.`);
    } catch (err: any) {
      alert("Sync failed: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const createNew = () => {
    setConfig(INITIAL_CONFIG);
    setActiveWidgetId(null);
    setActiveTab('branding');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadWidget = (widget: SavedWidget) => {
    setConfig(widget.config);
    setActiveWidgetId(widget.id);
    setActiveTab('branding');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveWidget = async () => {
    if (!cloudEnabled) {
      alert("Connect your database in 'Settings' to save.");
      setActiveTab('settings');
      return;
    }
    const data = { name: config.name, config, updated_at: new Date().toISOString() };
    try {
      const res = activeWidgetId 
        ? await supabase.from('widgets').update(data).eq('id', activeWidgetId).select() 
        : await supabase.from('widgets').insert([data]).select();
      if (!res.error) {
        setActiveWidgetId(res.data[0].id);
        fetchWidgets();
        alert("Widget saved!");
      }
    } catch (e) { alert("Save error."); }
  };

  const addItem = (listKey: 'corePricingItems' | 'smartAddons') => {
    const newItem: ManualPriceItem = { id: Date.now().toString(), label: '', price: '', description: '' };
    setConfig({ ...config, [listKey]: [...(config[listKey] || []), newItem] });
  };

  const removeItem = (listKey: 'corePricingItems' | 'smartAddons', id: string) => {
    setConfig({ ...config, [listKey]: (config[listKey] || []).filter(i => i.id !== id) });
  };

  const updateItem = (listKey: 'corePricingItems' | 'smartAddons', id: string, field: keyof ManualPriceItem, value: string) => {
    setConfig({
      ...config,
      [listKey]: (config[listKey] || []).map(i => i.id === id ? { ...i, [field]: value } : i)
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900">
      <aside className="w-full md:w-72 bg-white border-r border-slate-200 p-8 flex flex-col shrink-0 z-20 shadow-sm">
        <div className="flex items-center space-x-3 mb-12">
          <div className="bg-orange-600 w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-2">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 011-1h3a1 1 0 001-1V4z" /></svg>
          </div>
          <span className="text-2xl font-black tracking-tight">Handy<span className="text-orange-600">Bot</span></span>
        </div>
        
        <nav className="flex-1 space-y-1">
          <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon="grid" label="My Widgets" />
          <div className="pt-8 pb-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Editor</div>
          <NavItem active={activeTab === 'branding'} onClick={() => setActiveTab('branding')} icon="paint" label="Appearance" />
          <NavItem active={activeTab === 'pricing'} onClick={() => setActiveTab('pricing')} icon="tag" label="Pricing" />
          <NavItem active={activeTab === 'prompt'} onClick={() => setActiveTab('prompt')} icon="sparkles" label="AI Prompt" />
          <NavItem active={activeTab === 'demo'} onClick={() => setActiveTab('demo')} icon="play" label="Live Demo" />
          <NavItem active={activeTab === 'leads'} onClick={() => setActiveTab('leads')} icon="user" label="Leads" />
          <NavItem active={activeTab === 'embed'} onClick={() => setActiveTab('embed')} icon="code" label="WordPress" />
        </nav>

        <div className="pt-8 border-t border-slate-100 mt-8 space-y-3">
          <button onClick={saveWidget} className="w-full py-4 bg-orange-600 text-white rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition-all">Save Changes</button>
          <button onClick={() => setActiveTab('settings')} className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">Settings</button>
        </div>
      </aside>

      <main className="flex-1 p-8 md:p-16 overflow-y-auto bg-slate-50">
        <div className="max-w-6xl mx-auto pb-32">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
                <h1 className="text-4xl font-black text-slate-800 tracking-tight">My Handyman Bots</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <button onClick={createNew} className="p-10 border-4 border-dashed border-slate-200 rounded-[2.5rem] text-slate-400 font-black hover:border-orange-500 hover:text-orange-600 transition-all flex flex-col items-center justify-center group bg-white/50 hover:bg-white">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-orange-50 transition-colors"><span className="text-4xl">+</span></div>
                    <span>Build New Bot</span>
                  </button>
                  {savedWidgets.map(w => (
                    <div key={w.id} onClick={() => loadWidget(w)} className={`p-8 bg-white rounded-[2.5rem] border-2 cursor-pointer transition-all hover:shadow-2xl hover:scale-[1.02] flex flex-col justify-between group ${activeWidgetId === w.id ? 'border-orange-600 shadow-xl' : 'border-transparent shadow-sm'}`}>
                      <div className="flex items-center space-x-6">
                        <img src={w.config.profilePic} className="w-20 h-20 rounded-[1.5rem] object-cover border-2 border-slate-50 shadow-md" />
                        <div>
                          <h4 className="font-black text-xl text-slate-800 group-hover:text-orange-600 transition-colors">{w.config.name}</h4>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'branding' && <BrandingTab config={config} setConfig={setConfig} />}
            
            {activeTab === 'pricing' && (
              <motion.div key="pricing" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                  <div>
                    <h1 className="text-4xl font-black text-slate-800 tracking-tight">Pricing Engine</h1>
                    <p className="text-slate-400 font-medium mt-2">Manage how your AI calculates costs.</p>
                  </div>
                  <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-1">
                    <button onClick={() => setConfig({...config, pricingSource: 'manual'})} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${config.pricingSource === 'manual' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Manual Mode</button>
                    <button onClick={() => setConfig({...config, pricingSource: 'sheet'})} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${config.pricingSource === 'sheet' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Sheet Sync</button>
                  </div>
                </div>

                {config.pricingSource === 'sheet' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-12 rounded-[3rem] shadow-sm space-y-8 border border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-6 items-end">
                      <Field label="Google Sheet Link" value={config.googleSheetUrl} onChange={(v: string) => setConfig({...config, googleSheetUrl: v})} placeholder="Paste URL here..." />
                      <button onClick={syncSheetData} disabled={isSyncing} className={`w-full py-6 rounded-[1.8rem] font-black text-sm uppercase tracking-widest transition-all ${isSyncing ? 'bg-slate-100 text-slate-400' : 'bg-green-600 text-white shadow-xl hover:scale-[1.02]'}`}>
                        {isSyncing ? 'Syncing...' : 'Sync Now'}
                      </button>
                    </div>
                  </motion.div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <PricingColumn title="Core Services" list={config.corePricingItems} accent="orange" onAdd={() => addItem('corePricingItems')} onRemove={(id) => removeItem('corePricingItems', id)} onUpdate={(id, f, v) => updateItem('corePricingItems', id, f, v)} readOnly={config.pricingSource === 'sheet'} />
                  <PricingColumn title="Smart Add-ons" list={config.smartAddons} accent="purple" onAdd={() => addItem('smartAddons')} onRemove={(id) => removeItem('smartAddons', id)} onUpdate={(id, f, v) => updateItem('smartAddons', id, f, v)} readOnly={config.pricingSource === 'sheet'} />
                </div>

                <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl space-y-6">
                  <div className="flex items-center space-x-3 text-white">
                    <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    <h3 className="font-black text-lg">General Pricing Rules (AI Logic)</h3>
                  </div>
                  <textarea value={config.pricingRules} onChange={e => setConfig({...config, pricingRules: e.target.value})} className="w-full p-8 bg-white/5 border border-white/10 rounded-[2rem] h-32 focus:border-orange-500 outline-none text-sm text-orange-100 font-medium leading-relaxed" />
                </div>
              </motion.div>
            )}

            {activeTab === 'prompt' && (
              <motion.div key="prompt" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10 max-w-4xl">
                <div>
                  <h1 className="text-4xl font-black text-slate-800 tracking-tight">AI Behavior</h1>
                  <p className="text-slate-400 font-medium mt-2">Instruct your AI agent on how to interact with customers.</p>
                </div>
                
                <div className="bg-white p-12 rounded-[3.5rem] shadow-sm border border-slate-100 space-y-8">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <div>
                      <h3 className="font-black text-xl text-slate-800">System Instruction</h3>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">The "Brain" of your agent</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Custom AI Instructions</label>
                    <textarea 
                      value={config.systemPrompt} 
                      onChange={e => setConfig({...config, systemPrompt: e.target.value})} 
                      className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] h-64 focus:border-orange-500 outline-none text-sm font-medium leading-relaxed shadow-inner"
                      placeholder="e.g. You are a friendly, expert plumber. Use professional terminology but explain it simply. Always emphasize safety and long-term value..."
                    />
                  </div>
                  
                  <button onClick={() => setActiveTab('demo')} className="flex items-center space-x-3 text-orange-600 font-black text-xs uppercase tracking-widest hover:translate-x-1 transition-transform">
                    <span>Test behavior in Live Demo</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5-5 5M6 7l5 5-5 5" /></svg>
                  </button>
                </div>
              </motion.div>
            )}

            {activeTab === 'demo' && <DemoTab config={config} />}
            {activeTab === 'leads' && <LeadsTab leads={leads} />}
            {activeTab === 'embed' && <EmbedTab widgetId={activeWidgetId} />}
            {activeTab === 'settings' && <SettingsTab 
                config={config} setConfig={setConfig}
                tempUrl={tempUrl} setTempUrl={setTempUrl} 
                tempKey={tempKey} setTempKey={setTempKey} 
                onConnect={handleConnect}
                hasGeminiKey={hasGeminiKey}
                onOpenKey={handleOpenKey}
            />}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

const EmbedTab = ({ widgetId }: { widgetId: string | null }) => {
  const currentUrl = window.location.href.split('?')[0];
  const embedUrl = `${currentUrl}?widget=1${widgetId ? `&id=${widgetId}` : ''}`;
  
  const iframeCode = `<iframe 
  src="${embedUrl}" 
  style="position: fixed; bottom: 20px; right: 20px; width: 440px; height: 800px; border: none; z-index: 999999; background: transparent;" 
  allow="camera; microphone; geolocation"
  title="HandyBot AI Estimator"
></iframe>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(iframeCode);
    alert("Iframe snippet copied to clipboard!");
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10 max-w-4xl">
      <div>
        <h1 className="text-4xl font-black text-slate-800 tracking-tight">Launch Code</h1>
        <p className="text-slate-400 font-medium mt-2">Embed your HandyBot on WordPress or any HTML site using an Iframe.</p>
      </div>
      
      <div className="bg-slate-900 p-12 rounded-[3.5rem] shadow-2xl relative group">
        <div className="absolute top-8 right-8">
           <button onClick={handleCopy} className="p-4 bg-white/10 text-orange-400 rounded-2xl hover:bg-orange-600 hover:text-white transition-all shadow-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
           </button>
        </div>
        
        <p className="text-slate-400 text-xs font-bold uppercase mb-4 tracking-widest">Copy this Universal Iframe:</p>
        <pre className="text-orange-300 text-[11px] overflow-x-auto whitespace-pre font-mono leading-loose bg-black/30 p-8 rounded-[2rem] border border-white/5">
          {iframeCode}
        </pre>

        <div className="mt-8 flex items-center space-x-3 text-slate-500">
           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
           <p className="text-xs font-medium">Place this code just before the closing <code>&lt;/body&gt;</code> tag of your theme or in a Custom HTML block.</p>
        </div>
      </div>

      <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-4">
        <h3 className="font-black text-xl text-slate-800">WordPress Implementation</h3>
        <p className="text-slate-500 text-sm leading-relaxed">
          In your WordPress Dashboard, go to <b>Appearance > Customize > Widgets</b> (or use a plugin like "Header and Footer Scripts"). Add a <b>Custom HTML</b> block to your footer and paste the snippet above. The HandyBot button will automatically float in the corner of your entire site.
        </p>
      </div>
    </motion.div>
  );
};

const DemoTab = ({ config }: { config: BusinessConfig }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
    <div className="flex justify-between items-center">
      <h1 className="text-4xl font-black text-slate-800 tracking-tight">Live Test Environment</h1>
      <div className="flex items-center space-x-2 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm">
        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live Preview</span>
      </div>
    </div>

    <div className="relative w-full aspect-video bg-white rounded-[3.5rem] shadow-2xl border border-slate-200 overflow-hidden group">
      <div className="absolute top-0 inset-x-0 h-16 bg-slate-50 border-b border-slate-200 flex items-center px-8 justify-between z-10">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-400 rounded-full" />
          <div className="w-3 h-3 bg-yellow-400 rounded-full" />
          <div className="w-3 h-3 bg-green-400 rounded-full" />
        </div>
        <div className="bg-slate-200 px-6 py-1.5 rounded-lg text-[10px] font-bold text-slate-400">https://yourclientwebsite.com</div>
        <div className="w-10 h-10 bg-slate-200 rounded-full" />
      </div>

      <div className="pt-24 px-20 space-y-10 opacity-30 select-none">
        <div className="space-y-4">
          <div className="h-12 w-2/3 bg-slate-200 rounded-2xl" />
          <div className="h-4 w-1/2 bg-slate-200 rounded-lg" />
        </div>
        <div className="grid grid-cols-3 gap-8">
          {[1,2,3].map(i => (
            <div key={i} className="aspect-square bg-slate-100 rounded-[2.5rem]" />
          ))}
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none z-20">
        <AIWidget config={config} />
      </div>

      <div className="absolute bottom-8 left-8 bg-black/80 backdrop-blur-md px-6 py-4 rounded-2xl text-white max-w-xs transition-transform transform translate-y-20 group-hover:translate-y-0 duration-500 border border-white/10">
        <p className="text-xs font-bold leading-relaxed">
          <span className="text-orange-400">Sandbox Active:</span> This is how the bot looks and feels on your client's site. Use the bottom-right corner to start a test estimation.
        </p>
      </div>
    </div>
  </motion.div>
);

const PricingColumn = ({ title, list, accent, onAdd, onRemove, onUpdate, readOnly }: any) => (
  <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col">
    <div className="flex justify-between items-center mb-8">
      <h3 className="font-black text-xl text-slate-700">{title}</h3>
      {!readOnly && (
        <button onClick={onAdd} className={`text-[10px] font-black text-${accent}-600 hover:bg-${accent}-50 px-4 py-2 rounded-xl transition-all`}>+ New Item</button>
      )}
    </div>
    <div className="space-y-4 flex-1 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
      {list?.map((item: any) => (
        <div key={item.id} className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 space-y-4 relative group hover:bg-white hover:shadow-md transition-all">
          {!readOnly && (
            <button onClick={() => onRemove(item.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_100px] gap-4">
            <input disabled={readOnly} value={item.label} onChange={e => onUpdate(item.id, 'label', e.target.value)} className="bg-white border-2 border-slate-100 p-3 rounded-xl text-sm font-bold disabled:bg-slate-50" placeholder="Label" />
            <input disabled={readOnly} value={item.price} onChange={e => onUpdate(item.id, 'price', e.target.value)} className="bg-white border-2 border-slate-100 p-3 rounded-xl text-sm font-bold disabled:bg-slate-50" placeholder="Price" />
          </div>
          <textarea disabled={readOnly} value={item.description} onChange={e => onUpdate(item.id, 'description', e.target.value)} className="w-full bg-white border-2 border-slate-100 p-3 rounded-xl text-xs font-medium h-16 disabled:bg-slate-50 resize-none" placeholder="Description..." />
        </div>
      ))}
      {(!list || list.length === 0) && <div className="text-center py-20 text-slate-300 text-xs font-bold uppercase tracking-widest border-2 border-dashed border-slate-100 rounded-[2rem]">No items {readOnly ? 'synced' : 'added'}</div>}
    </div>
  </div>
);

const NavItem = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`w-full flex items-center space-x-5 px-7 py-5 rounded-3xl transition-all ${active ? 'bg-orange-600 text-white font-black shadow-2xl scale-105' : 'text-slate-500 hover:bg-slate-50'}`}>
    <span className="text-2xl">
      {icon === 'grid' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>}
      {icon === 'paint' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>}
      {icon === 'tag' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
      {icon === 'sparkles' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" /></svg>}
      {icon === 'play' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
      {icon === 'user' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
      {icon === 'code' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>}
    </span>
    <span className="text-[11px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

const Field = ({ label, value, onChange, type = 'text', placeholder = '' }: any) => (
  <div className="space-y-3 w-full">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[1.8rem] focus:border-orange-500 outline-none text-sm font-bold shadow-sm" />
  </div>
);

const BrandingTab = ({ config, setConfig }: any) => (
  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10 max-w-4xl">
    <h1 className="text-4xl font-black text-slate-800 tracking-tight">Appearance</h1>
    <div className="bg-white p-12 rounded-[3rem] shadow-sm space-y-10 border border-slate-100">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <Field label="Estimator Name" value={config.name} onChange={(v: string) => setConfig({...config, name: v})} />
        <Field label="Brand Primary Color" type="color" value={config.primaryColor} onChange={(v: string) => setConfig({...config, primaryColor: v})} />
      </div>
      <Field label="Profile Picture URL" value={config.profilePic} onChange={(v: string) => setConfig({...config, profilePic: v})} />
    </div>
  </motion.div>
);

/**
 * LeadsTab Component - Displays the project leads fetched from Supabase.
 */
const LeadsTab = ({ leads }: any) => (
  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10 max-w-4xl">
    <h1 className="text-4xl font-black text-slate-800 tracking-tight">Project Leads</h1>
    <div className="grid grid-cols-1 gap-6">
      {leads.length > 0 ? leads.map((lead: any) => (
        <div key={lead.id} className="p-8 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center">
          <div className="flex-1">
            <h5 className="font-black text-2xl text-slate-800">{lead.name}</h5>
            <p className="text-sm text-slate-400 font-bold uppercase tracking-wider">{lead.email} • {lead.phone}</p>
            {(lead.date || lead.time) && (
              <p className="text-xs text-orange-600 font-black mt-1 uppercase tracking-widest">
                Requested: {lead.date || 'TBD'} @ {lead.time || 'TBD'}
              </p>
            )}
          </div>
          <div className="px-5 py-2 bg-orange-50 text-orange-600 rounded-2xl text-xs font-black uppercase tracking-widest whitespace-nowrap">
            {lead.estimate_json?.estimatedCostRange}
          </div>
        </div>
      )) : <div className="bg-white p-32 rounded-[4rem] text-center border-4 border-dashed border-slate-100 text-slate-400 font-black">No estimates yet.</div>}
    </div>
  </motion.div>
);

const SettingsTab = ({ config, setConfig, tempUrl, setTempUrl, tempKey, setTempKey, onConnect, hasGeminiKey, onOpenKey }: any) => (
  <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-10 max-w-xl pb-20">
    <div>
        <h1 className="text-4xl font-black text-slate-800 tracking-tight">System Settings</h1>
        <p className="text-slate-400 font-medium mt-2">Connect your infrastructure and AI models.</p>
    </div>

    <div className="bg-white p-12 rounded-[3rem] shadow-sm space-y-8 border border-slate-100">
      <div className="flex items-center space-x-4 mb-2">
         <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
         </div>
         <h2 className="font-black text-xl text-slate-800">Gemini 3 Flash Access</h2>
      </div>
      
      <div className={`p-6 rounded-2xl border-2 transition-all ${hasGeminiKey ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}>
        <div className="flex justify-between items-center">
            <div>
                <p className={`text-xs font-black uppercase tracking-widest ${hasGeminiKey ? 'text-green-600' : 'text-orange-600'}`}>
                    {hasGeminiKey ? '✓ Project Connected' : '⚠ Action Required'}
                </p>
                <p className="text-xs text-slate-500 font-medium mt-1">
                    {hasGeminiKey ? 'Your bot is powered by Gemini 3 Flash reasoning.' : 'Select a project key to enable high-intelligence estimates.'}
                </p>
            </div>
            <button 
                onClick={onOpenKey} 
                className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all ${hasGeminiKey ? 'bg-white text-green-600 border border-green-200' : 'bg-orange-600 text-white'}`}
            >
                {hasGeminiKey ? 'Change Key' : 'Select Key'}
            </button>
        </div>
      </div>
    </div>

    {/* Resend Email Section */}
    <div className="bg-white p-12 rounded-[3rem] shadow-sm space-y-8 border border-slate-100">
      <div className="flex items-center space-x-4 mb-2">
         <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
         </div>
         <h2 className="font-black text-xl text-slate-800">Email Communication</h2>
      </div>
      <Field 
        label="Resend API Key" 
        type="password" 
        value={config.leadGenConfig.resendApiKey || ''} 
        onChange={(v: string) => setConfig({
          ...config, 
          leadGenConfig: { ...config.leadGenConfig, resendApiKey: v }
        })} 
        placeholder="re_..."
      />
      <Field 
        label="Destination Email (Company)" 
        value={config.leadGenConfig.targetEmail || ''} 
        onChange={(v: string) => setConfig({
          ...config, 
          leadGenConfig: { ...config.leadGenConfig, targetEmail: v }
        })} 
        placeholder="leads@yourhandyman.com"
      />
      <p className="text-[10px] text-slate-400 leading-relaxed pl-1">
        Configure <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold underline">Resend</a> to send professional confirmation emails to both you and your customers instantly.
      </p>
    </div>

    <div className="bg-white p-12 rounded-[3rem] shadow-sm space-y-8 border border-slate-100">
      <div className="flex items-center space-x-4 mb-2">
         <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7c0-2-1.5-3-3.5-3h-9C5.5 4 4 5 4 7z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6M9 16h6" /></svg>
         </div>
         <h2 className="font-black text-xl text-slate-800">Cloud Database</h2>
      </div>
      <Field label="Supabase URL" value={tempUrl} onChange={setTempUrl} />
      <Field label="Supabase Anon Key" type="password" value={tempKey} onChange={setTempKey} />
      <button onClick={onConnect} className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black text-lg shadow-xl active:scale-95 transition-all">Connect Database</button>
    </div>
  </motion.div>
);

export default App;
