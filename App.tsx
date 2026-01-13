
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BusinessConfig, SavedWidget, AppTab, LeadRecord, ManualPriceItem 
} from './types.ts';
import AIWidget from './components/AIWidget.tsx';
import { 
  supabase, isSupabaseConfigured, updateSupabaseConfig, 
  getSupabaseConfig 
} from './services/supabaseClient.ts';

const INITIAL_CONFIG: BusinessConfig = {
  name: 'SwiftFix Handyman',
  primaryColor: '#f97316',
  headerTitle: 'HandyBot AI',
  headerSubtitle: 'Instant Estimates',
  profilePic: 'https://images.unsplash.com/photo-1581578731548-c64695cc6958?q=80&w=256&h=256&auto=format&fit=crop',
  hoverTitle: 'Get a Quote',
  widgetIcon: 'dollar',
  zipCodeLabel: 'Zip Code',
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
    senderName: 'HandyBot Estimator',
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
  const [hasGeminiKey, setHasGeminiKey] = useState(false);

  const [tempUrl, setTempUrl] = useState(getSupabaseConfig().url || '');
  const [tempKey, setTempKey] = useState(getSupabaseConfig().key || '');

  useEffect(() => {
    const checkGeminiKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const selected = await (window as any).aistudio.hasSelectedApiKey();
        setHasGeminiKey(selected);
      }
    };
    checkGeminiKey();
  }, []);

  const fetchWidgets = async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const { data, error } = await supabase.from('widgets').select('*').order('updated_at', { ascending: false });
      if (!error) setSavedWidgets(data || []);
    } catch (e) { console.error(e); }
  };

  const fetchLeads = async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
      if (!error) setLeads(data || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { 
    if (cloudEnabled) {
      fetchWidgets();
      fetchLeads();
    }
  }, [cloudEnabled]);

  const saveWidget = async () => {
    if (!cloudEnabled) { alert("Connect DB in Settings first"); setActiveTab('settings'); return; }
    const data = { name: config.name, config, updated_at: new Date().toISOString() };
    try {
      const res = activeWidgetId 
        ? await supabase.from('widgets').update(data).eq('id', activeWidgetId).select() 
        : await supabase.from('widgets').insert([data]).select();
      if (!res.error) {
        setActiveWidgetId(res.data[0].id);
        fetchWidgets();
        alert("Saved!");
      }
    } catch (e) { alert("Save error"); }
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

  const syncSheetData = async () => {
    let targetUrl = config.googleSheetUrl;
    if (!targetUrl) return alert("Please enter a valid Google Sheet URL.");
    if (!targetUrl.includes('/export?format=csv')) {
      const match = targetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) targetUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
    }
    
    setIsSyncing(true);
    try {
      const response = await fetch(targetUrl);
      const csvText = await response.text();
      const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length < 2) throw new Error("Sheet is empty.");

      const newCore: ManualPriceItem[] = [];
      const newAddons: ManualPriceItem[] = [];

      // Improved Regex for CSV splitting to handle quoted fields with commas
      const csvRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

      lines.slice(1).forEach((line, idx) => {
        const parts = line.split(csvRegex).map(s => s?.trim().replace(/^"|"$/g, ''));
        if (parts.length < 2) return; // Skip invalid lines

        const [type, label, price, description] = parts;
        const item: ManualPriceItem = { 
          id: `sheet-${idx}-${Date.now()}`, 
          label: label || 'No Label', 
          price: price || '$0', 
          description: description || '' 
        };

        const typeLower = type?.toLowerCase() || '';
        // Broaden core item detection
        if (typeLower.includes('core') || typeLower.includes('service') || typeLower.includes('main')) {
          newCore.push(item);
        } else {
          newAddons.push(item);
        }
      });

      setConfig(prev => ({
        ...prev,
        corePricingItems: newCore,
        smartAddons: newAddons,
        useSheetData: true
      }));
      alert(`Synced successfully! Found ${newCore.length} Core items and ${newAddons.length} Add-ons.`);
    } catch (err: any) {
      alert("Sync failed: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900">
      <aside className="w-full md:w-72 bg-white border-r border-slate-200 p-8 flex flex-col shrink-0 z-20 shadow-sm">
        <div className="flex items-center space-x-3 mb-12">
          <div className="bg-orange-600 w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-2">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <span className="text-2xl font-black tracking-tight">Handy<span className="text-orange-600">Bot</span></span>
        </div>
        
        <nav className="flex-1 space-y-1">
          <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon="grid" label="My Widgets" />
          <div className="pt-8 pb-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Editor</div>
          <NavItem active={activeTab === 'branding'} onClick={() => setActiveTab('branding')} icon="paint" label="Appearance" />
          <NavItem active={activeTab === 'pricing'} onClick={() => setActiveTab('pricing')} icon="tag" label="Pricing" />
          <NavItem active={activeTab === 'prompt'} onClick={() => setActiveTab('prompt')} icon="sparkles" label="AI Prompt" />
          <NavItem active={activeTab === 'comms'} onClick={() => setActiveTab('comms')} icon="mail" label="Communication" />
          <NavItem active={activeTab === 'leads'} onClick={() => setActiveTab('leads')} icon="user" label="Leads" />
          <NavItem active={activeTab === 'demo'} onClick={() => setActiveTab('demo')} icon="play" label="Live Demo" />
          <NavItem active={activeTab === 'embed'} onClick={() => setActiveTab('embed')} icon="code" label="Embed Code" />
        </nav>

        <div className="pt-8 border-t border-slate-100 mt-8 space-y-3">
          <button onClick={saveWidget} className="w-full py-4 bg-orange-600 text-white rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition-all">Save Changes</button>
          <button onClick={() => setActiveTab('settings')} className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">Settings</button>
        </div>
      </aside>

      <main className="flex-1 p-8 md:p-16 overflow-y-auto bg-slate-50">
        <div className="max-w-6xl mx-auto pb-32">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && <DashboardTab savedWidgets={savedWidgets} loadWidget={(w: any) => { setConfig(w.config); setActiveWidgetId(w.id); setActiveTab('branding'); }} createNew={() => { setConfig(INITIAL_CONFIG); setActiveWidgetId(null); setActiveTab('branding'); }} activeWidgetId={activeWidgetId} />}
            {activeTab === 'branding' && <BrandingTab config={config} setConfig={setConfig} />}
            {activeTab === 'pricing' && <PricingTab config={config} setConfig={setConfig} isSyncing={isSyncing} syncSheetData={syncSheetData} addItem={addItem} removeItem={removeItem} updateItem={updateItem} />}
            {activeTab === 'prompt' && <PromptTab config={config} setConfig={setConfig} />}
            {activeTab === 'comms' && <CommsTab config={config} setConfig={setConfig} />}
            {activeTab === 'leads' && <LeadsTab leads={leads} />}
            {activeTab === 'demo' && <DemoTab config={config} />}
            {activeTab === 'embed' && <EmbedTab widgetId={activeWidgetId} />}
            {activeTab === 'settings' && <SettingsTab config={config} setConfig={setConfig} tempUrl={tempUrl} setTempUrl={setTempUrl} tempKey={tempKey} setTempKey={setTempKey} onConnect={() => { updateSupabaseConfig(tempUrl, tempKey); setCloudEnabled(true); fetchWidgets(); fetchLeads(); }} hasGeminiKey={hasGeminiKey} onOpenKey={async () => { if ((window as any).aistudio?.openSelectKey) await (window as any).aistudio.openSelectKey(); setHasGeminiKey(true); }} />}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

const PricingTab = ({ config, setConfig, isSyncing, syncSheetData, addItem, removeItem, updateItem }: any) => (
  <motion.div key="pricing" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10">
    <div className="flex justify-between items-end">
      <div>
        <h1 className="text-4xl font-black text-slate-800 tracking-tight">Pricing Engine</h1>
        <p className="text-slate-400 font-medium mt-2">Define manual costs or sync from Google Sheets.</p>
      </div>
      <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-1">
        <button onClick={() => setConfig({...config, pricingSource: 'manual'})} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${config.pricingSource === 'manual' ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Manual</button>
        <button onClick={() => setConfig({...config, pricingSource: 'sheet'})} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${config.pricingSource === 'sheet' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Sheet Sync</button>
      </div>
    </div>

    {config.pricingSource === 'sheet' && (
      <div className="bg-white p-8 rounded-[2rem] shadow-sm space-y-6 border border-slate-100">
        <div className="flex gap-4 items-end">
          <Field label="Google Sheet URL" value={config.googleSheetUrl} onChange={(v: string) => setConfig({...config, googleSheetUrl: v})} placeholder="https://docs.google.com/spreadsheets/d/..." />
          <button onClick={syncSheetData} disabled={isSyncing} className="px-8 h-[64px] bg-green-600 text-white font-black rounded-2xl hover:bg-green-700 transition-all disabled:opacity-50 min-w-[140px] shadow-lg shadow-green-100">{isSyncing ? 'Syncing...' : 'Sync Now'}</button>
        </div>
        
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Required Sheet Format</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono text-slate-600 border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-200 p-2 text-left">Type</th>
                  <th className="border border-slate-200 p-2 text-left">Label</th>
                  <th className="border border-slate-200 p-2 text-left">Price</th>
                  <th className="border border-slate-200 p-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-200 p-2 font-bold text-orange-600">Core</td>
                  <td className="border border-slate-200 p-2 italic">Drain Unclog</td>
                  <td className="border border-slate-200 p-2 italic">$150</td>
                  <td className="border border-slate-200 p-2 italic">Standard sink unclogging</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 p-2 font-bold text-indigo-600">Add-on</td>
                  <td className="border border-slate-200 p-2 italic">Pipe Cleaning</td>
                  <td className="border border-slate-200 p-2 italic">$50</td>
                  <td className="border border-slate-200 p-2 italic">Hydro jetting addon</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[10px] text-slate-400 font-medium italic">Make sure your sheet is "Public" or "Anyone with the link can view".</p>
        </div>
      </div>
    )}

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <PricingColumn title="Core Services" list={config.corePricingItems} accent="orange" onAdd={() => addItem('corePricingItems')} onRemove={(id: string) => removeItem('corePricingItems', id)} onUpdate={(id: string, f: any, v: any) => updateItem('corePricingItems', id, f, v)} readOnly={config.pricingSource === 'sheet'} />
      <PricingColumn title="Smart Add-ons" list={config.smartAddons} accent="indigo" onAdd={() => addItem('smartAddons')} onRemove={(id: string) => removeItem('smartAddons', id)} onUpdate={(id: string, f: any, v: any) => updateItem('smartAddons', id, f, v)} readOnly={config.pricingSource === 'sheet'} />
    </div>

    <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl space-y-6">
      <div className="flex items-center space-x-3 text-white"><h3 className="font-black text-lg">General Pricing Logic</h3></div>
      <textarea value={config.pricingRules} onChange={e => setConfig({...config, pricingRules: e.target.value})} className="w-full p-8 bg-white/5 border border-white/10 rounded-[2rem] h-32 focus:border-orange-500 outline-none text-sm text-orange-100 font-medium leading-relaxed" placeholder="Labor: $95/hr. Minimum: $150. Materials: Cost + 20%." />
    </div>
  </motion.div>
);

const PricingColumn = ({ title, list, onAdd, onRemove, onUpdate, readOnly, accent }: any) => (
  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
    <div className="flex justify-between items-center mb-6">
      <h3 className="font-black text-xl text-slate-800">{title}</h3>
      {!readOnly && <button onClick={onAdd} className={`text-[10px] font-black text-${accent}-600 hover:bg-${accent}-50 px-4 py-2 rounded-xl transition-all`}>+ Add New</button>}
    </div>
    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
      {list?.map((item: any) => (
        <div key={item.id} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 relative group shadow-sm hover:border-slate-200 transition-all">
          {!readOnly && <button onClick={() => onRemove(item.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg></button>}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <input disabled={readOnly} value={item.label} onChange={e => onUpdate(item.id, 'label', e.target.value)} className="bg-white p-3 rounded-xl border border-slate-200 text-sm font-bold focus:border-orange-500 outline-none" placeholder="Label" />
            <input disabled={readOnly} value={item.price} onChange={e => onUpdate(item.id, 'price', e.target.value)} className="bg-white p-3 rounded-xl border border-slate-200 text-sm font-bold focus:border-orange-500 outline-none" placeholder="Price" />
          </div>
          <textarea disabled={readOnly} value={item.description} onChange={e => onUpdate(item.id, 'description', e.target.value)} className="w-full bg-white p-3 rounded-xl border border-slate-200 text-xs font-medium h-16 resize-none focus:border-orange-500 outline-none" placeholder="Description" />
        </div>
      ))}
      {(!list || list.length === 0) && <div className="text-center py-20 text-slate-300 font-bold uppercase text-[10px] tracking-widest border-2 border-dashed border-slate-100 rounded-[2rem]">No items {readOnly ? 'found' : 'added'}</div>}
    </div>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <Field label="Profile Picture URL" value={config.profilePic} onChange={(v: string) => setConfig({...config, profilePic: v})} />
        <Field label="Zip/Postal Code Label" value={config.zipCodeLabel || 'Zip Code'} onChange={(v: string) => setConfig({...config, zipCodeLabel: v})} placeholder="e.g. Postal Code" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <Field label="Widget Header Title" value={config.headerTitle} onChange={(v: string) => setConfig({...config, headerTitle: v})} />
        <Field label="Widget Subtitle" value={config.headerSubtitle} onChange={(v: string) => setConfig({...config, headerSubtitle: v})} />
      </div>
    </div>
  </motion.div>
);

const DashboardTab = ({ savedWidgets, loadWidget, createNew, activeWidgetId }: any) => (
  <motion.div key="dashboard" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
    <h1 className="text-4xl font-black text-slate-800 tracking-tight">My Handyman Bots</h1>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <button onClick={createNew} className="p-10 border-4 border-dashed border-slate-200 rounded-[2.5rem] text-slate-400 font-black hover:border-orange-500 hover:text-orange-600 transition-all flex flex-col items-center justify-center group bg-white/50 hover:bg-white min-h-[220px]">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-orange-50 transition-colors"><span className="text-4xl">+</span></div>
        <span>Build New Bot</span>
      </button>
      {savedWidgets.map((w: any) => (
        <div key={w.id} onClick={() => loadWidget(w)} className={`p-8 bg-white rounded-[2.5rem] border-2 cursor-pointer transition-all hover:shadow-2xl hover:scale-[1.02] flex flex-col justify-between group min-h-[220px] ${activeWidgetId === w.id ? 'border-orange-600 shadow-xl' : 'border-transparent shadow-sm'}`}>
          <div className="flex items-center space-x-6">
            <img src={w.config.profilePic} className="w-20 h-20 rounded-[1.5rem] object-cover border-2 border-slate-50 shadow-md" />
            <div>
              <h4 className="font-black text-xl text-slate-800 group-hover:text-orange-600 transition-colors">{w.config.name}</h4>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Updated {new Date(w.updated_at).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-end">
            <div className="px-4 py-2 bg-slate-50 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:bg-orange-600 group-hover:text-white transition-all">Edit Agent</div>
          </div>
        </div>
      ))}
    </div>
  </motion.div>
);

const PromptTab = ({ config, setConfig }: any) => (
  <motion.div key="prompt" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10 max-w-4xl">
    <div>
      <h1 className="text-4xl font-black text-slate-800 tracking-tight">AI Behavior</h1>
      <p className="text-slate-400 font-medium mt-2">Instruct your AI agent on how to interact with customers.</p>
    </div>
    <div className="bg-white p-12 rounded-[3.5rem] shadow-sm border border-slate-100 space-y-8">
      <textarea 
        value={config.systemPrompt} 
        onChange={e => setConfig({...config, systemPrompt: e.target.value})} 
        className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] h-64 focus:border-orange-500 outline-none text-sm font-medium leading-relaxed shadow-inner"
        placeholder="e.g. You are a friendly, expert plumber..."
      />
    </div>
  </motion.div>
);

const CommsTab = ({ config, setConfig }: any) => (
  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10 max-w-4xl">
    <div>
      <h1 className="text-4xl font-black text-slate-800 tracking-tight">Communication</h1>
      <p className="text-slate-400 font-medium mt-2">Configure automated emails and webhooks for your leads.</p>
    </div>
    <div className="bg-white p-12 rounded-[3rem] shadow-sm space-y-10 border border-slate-100">
      <Field label="Resend API Key" type="password" placeholder="re_..." value={config.leadGenConfig.resendApiKey} onChange={(v: string) => setConfig({...config, leadGenConfig: { ...config.leadGenConfig, resendApiKey: v }})} />
      <Field label="Destination Email" placeholder="leads@yourbusiness.com" value={config.leadGenConfig.targetEmail} onChange={(v: string) => setConfig({...config, leadGenConfig: { ...config.leadGenConfig, targetEmail: v }})} />
      <Field label="Sender Name" placeholder="HandyBot Service" value={config.leadGenConfig.senderName} onChange={(v: string) => setConfig({...config, leadGenConfig: { ...config.leadGenConfig, senderName: v }})} />
    </div>
  </motion.div>
);

const LeadsTab = ({ leads }: { leads: LeadRecord[] }) => (
  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10 max-w-4xl">
    <h1 className="text-4xl font-black text-slate-800 tracking-tight">Project Leads</h1>
    <div className="grid grid-cols-1 gap-6">
      {leads.length > 0 ? leads.map((lead: any) => (
        <div key={lead.id} className="p-8 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm flex justify-between items-center">
          <div><h5 className="font-black text-2xl text-slate-800">{lead.name}</h5><p className="text-sm text-slate-400 font-bold">{lead.email} • {lead.phone}</p></div>
          <div className="px-5 py-2 bg-orange-50 text-orange-600 rounded-2xl text-xs font-black">{lead.estimate_json?.estimatedCostRange}</div>
        </div>
      )) : <div className="bg-white p-32 rounded-[4rem] text-center border-4 border-dashed border-slate-100 text-slate-400 font-black">No leads found.</div>}
    </div>
  </motion.div>
);

const DemoTab = ({ config }: { config: BusinessConfig }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
    <h1 className="text-4xl font-black text-slate-800 tracking-tight">Live Preview</h1>
    <div className="relative w-full aspect-video bg-white rounded-[3.5rem] shadow-2xl border border-slate-200 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none z-20"><AIWidget config={config} /></div>
      <div className="p-20 opacity-10 select-none"><div className="h-12 w-2/3 bg-slate-200 rounded-2xl mb-8" /><div className="grid grid-cols-3 gap-8">{[1,2,3].map(i => <div key={i} className="aspect-square bg-slate-100 rounded-[2.5rem]" />)}</div></div>
    </div>
  </motion.div>
);

const EmbedTab = ({ widgetId }: { widgetId: string | null }) => {
  const currentUrl = window.location.origin + window.location.pathname;
  const embedUrl = `${currentUrl}?widget=1${widgetId ? `&id=${widgetId}` : ''}`;
  const iframeCode = `<iframe src="${embedUrl}" style="position: fixed; bottom: 20px; right: 20px; width: 440px; height: 750px; border: none; z-index: 999999; background: transparent;" allow="camera; microphone; geolocation" title="HandyBot AI"></iframe>`;
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10 max-w-4xl">
      <h1 className="text-4xl font-black text-slate-800 tracking-tight">Embed Code</h1>
      <div className="bg-slate-900 p-12 rounded-[3.5rem] shadow-2xl">
        <pre className="text-orange-300 text-[11px] overflow-x-auto font-mono bg-black/30 p-8 rounded-[2rem] border border-white/5">{iframeCode}</pre>
        <button onClick={() => { navigator.clipboard.writeText(iframeCode); alert("Copied!"); }} className="mt-8 px-8 py-4 bg-orange-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all">Copy Snippet</button>
      </div>
    </motion.div>
  );
};

const SettingsTab = ({ config, setConfig, tempUrl, setTempUrl, tempKey, setTempKey, onConnect, hasGeminiKey, onOpenKey }: any) => (
  <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-10 max-w-xl pb-20">
    <h1 className="text-4xl font-black text-slate-800 tracking-tight">System Settings</h1>
    <div className="bg-white p-12 rounded-[3rem] shadow-sm space-y-8 border border-slate-100">
      <button onClick={onOpenKey} className={`w-full px-6 py-6 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all ${hasGeminiKey ? 'bg-green-600 text-white' : 'bg-orange-600 text-white'}`}>{hasGeminiKey ? '✓ AI Key Connected' : 'Connect AI Model Key'}</button>
      <Field label="Supabase URL" value={tempUrl} onChange={setTempUrl} />
      <Field label="Supabase Anon Key" type="password" value={tempKey} onChange={setTempKey} />
      <button onClick={onConnect} className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black text-lg shadow-xl active:scale-95 transition-all">Connect Database</button>
    </div>
  </motion.div>
);

const NavItem = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`w-full flex items-center space-x-5 px-7 py-5 rounded-3xl transition-all ${active ? 'bg-orange-600 text-white font-black shadow-2xl scale-105' : 'text-slate-500 hover:bg-slate-50'}`}>
    <span className="text-2xl">
      {icon === 'grid' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>}
      {icon === 'paint' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>}
      {icon === 'tag' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
      {icon === 'sparkles' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" /></svg>}
      {icon === 'mail' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v10a2 2 0 002 2z" /></svg>}
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

export default App;
