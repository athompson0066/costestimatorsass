
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

  const handleConnect = () => {
    try {
      if (!tempUrl || !tempKey) return alert("Please enter both URL and Key");
      updateSupabaseConfig(tempUrl, tempKey);
      setCloudEnabled(true);
      fetchWidgets();
      fetchLeads();
      alert("Database connected!");
    } catch (e: any) { alert(e.message); }
  };

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

  // Fix: Added missing loadWidget function to handle loading existing widgets from the dashboard.
  const loadWidget = (widget: SavedWidget) => {
    setConfig(widget.config);
    setActiveWidgetId(widget.id);
    setActiveTab('branding');
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
            {activeTab === 'dashboard' && <DashboardTab savedWidgets={savedWidgets} loadWidget={loadWidget} createNew={() => { setConfig(INITIAL_CONFIG); setActiveWidgetId(null); setActiveTab('branding'); }} activeWidgetId={activeWidgetId} />}
            {activeTab === 'branding' && <BrandingTab config={config} setConfig={setConfig} />}
            {activeTab === 'pricing' && <PricingTab config={config} setConfig={setConfig} isSyncing={isSyncing} setIsSyncing={setIsSyncing} />}
            {activeTab === 'prompt' && <PromptTab config={config} setConfig={setConfig} />}
            {activeTab === 'comms' && <CommsTab config={config} setConfig={setConfig} />}
            {activeTab === 'leads' && <LeadsTab leads={leads} />}
            {activeTab === 'demo' && <DemoTab config={config} />}
            {activeTab === 'embed' && <EmbedTab widgetId={activeWidgetId} />}
            {activeTab === 'settings' && <SettingsTab config={config} setConfig={setConfig} tempUrl={tempUrl} setTempUrl={setTempUrl} tempKey={tempKey} setTempKey={setTempKey} onConnect={handleConnect} hasGeminiKey={hasGeminiKey} onOpenKey={handleOpenKey} />}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

const CommsTab = ({ config, setConfig }: any) => (
  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10 max-w-4xl">
    <div>
      <h1 className="text-4xl font-black text-slate-800 tracking-tight">Communication</h1>
      <p className="text-slate-400 font-medium mt-2">Configure automated emails and webhooks for your leads.</p>
    </div>

    <div className="bg-white p-12 rounded-[3rem] shadow-sm space-y-10 border border-slate-100">
      <div className="flex items-center space-x-4">
        <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        </div>
        <div>
          <h3 className="font-black text-xl text-slate-800">Email Notifications (via Resend)</h3>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Send professional confirmation & lead alerts</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Field 
          label="Resend API Key" 
          type="password"
          placeholder="re_..."
          value={config.leadGenConfig.resendApiKey} 
          onChange={(v: string) => setConfig({...config, leadGenConfig: { ...config.leadGenConfig, resendApiKey: v }})} 
        />
        <Field 
          label="Destination Email (Client)" 
          placeholder="leads@yourbusiness.com"
          value={config.leadGenConfig.targetEmail} 
          onChange={(v: string) => setConfig({...config, leadGenConfig: { ...config.leadGenConfig, targetEmail: v }})} 
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Field 
          label="Sender Name" 
          placeholder="e.g. HandyBot Service"
          value={config.leadGenConfig.senderName} 
          onChange={(v: string) => setConfig({...config, leadGenConfig: { ...config.leadGenConfig, senderName: v }})} 
        />
        <div className="flex flex-col justify-end pb-4">
          <p className="text-xs text-slate-500 font-medium">Both you and your customer will receive high-quality branded templates automatically.</p>
        </div>
      </div>
    </div>

    <div className="bg-white p-12 rounded-[3rem] shadow-sm space-y-6 border border-slate-100">
      <h3 className="font-black text-xl text-slate-800">Other Integrations</h3>
      <Field 
        label="Google Sheets Webhook (Optional)" 
        placeholder="https://script.google.com/..."
        value={config.leadGenConfig.googleSheetWebhookUrl} 
        onChange={(v: string) => setConfig({...config, leadGenConfig: { ...config.leadGenConfig, googleSheetWebhookUrl: v }})} 
      />
    </div>
  </motion.div>
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

const PricingTab = ({ config, setConfig, isSyncing, setIsSyncing }: any) => (
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
    
    <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl space-y-6">
      <div className="flex items-center space-x-3 text-white">
        <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        <h3 className="font-black text-lg">General Pricing Rules (AI Logic)</h3>
      </div>
      <textarea value={config.pricingRules} onChange={e => setConfig({...config, pricingRules: e.target.value})} className="w-full p-8 bg-white/5 border border-white/10 rounded-[2rem] h-32 focus:border-orange-500 outline-none text-sm text-orange-100 font-medium leading-relaxed" placeholder="Labor: $95/hr. Minimum: $150..." />
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

const EmbedTab = ({ widgetId }: { widgetId: string | null }) => {
  const currentUrl = window.location.origin + window.location.pathname;
  const embedUrl = `${currentUrl}?widget=1${widgetId ? `&id=${widgetId}` : ''}`;
  const iframeCode = `<iframe src="${embedUrl}" style="position: fixed; bottom: 20px; right: 20px; width: 440px; height: 750px; border: none; z-index: 999999; background: transparent;" allow="camera; microphone; geolocation" title="HandyBot AI"></iframe>`;
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10 max-w-4xl">
      <h1 className="text-4xl font-black text-slate-800 tracking-tight">Embed Code</h1>
      <div className="bg-slate-900 p-12 rounded-[3.5rem] shadow-2xl">
        <pre className="text-orange-300 text-[11px] overflow-x-auto whitespace-pre font-mono leading-loose bg-black/30 p-8 rounded-[2rem] border border-white/5">{iframeCode}</pre>
        <button onClick={() => { navigator.clipboard.writeText(iframeCode); alert("Copied!"); }} className="mt-8 px-8 py-4 bg-orange-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all">Copy Snippet</button>
      </div>
    </motion.div>
  );
};

const DemoTab = ({ config }: { config: BusinessConfig }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
    <h1 className="text-4xl font-black text-slate-800 tracking-tight">Live Preview</h1>
    <div className="relative w-full aspect-video bg-white rounded-[3.5rem] shadow-2xl border border-slate-200 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none z-20">
        <AIWidget config={config} />
      </div>
      <div className="p-20 opacity-10 select-none">
        <div className="h-12 w-2/3 bg-slate-200 rounded-2xl mb-8" />
        <div className="grid grid-cols-3 gap-8">
          {[1,2,3].map(i => <div key={i} className="aspect-square bg-slate-100 rounded-[2.5rem]" />)}
        </div>
      </div>
    </div>
  </motion.div>
);

const LeadsTab = ({ leads }: { leads: LeadRecord[] }) => (
  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10 max-w-4xl">
    <h1 className="text-4xl font-black text-slate-800 tracking-tight">Project Leads</h1>
    <div className="grid grid-cols-1 gap-6">
      {leads.length > 0 ? leads.map((lead: any) => (
        <div key={lead.id} className="p-8 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center">
          <div className="flex-1">
            <h5 className="font-black text-2xl text-slate-800">{lead.name}</h5>
            <p className="text-sm text-slate-400 font-bold uppercase tracking-wider">{lead.email} • {lead.phone}</p>
          </div>
          <div className="px-5 py-2 bg-orange-50 text-orange-600 rounded-2xl text-xs font-black uppercase tracking-widest whitespace-nowrap">{lead.estimate_json?.estimatedCostRange}</div>
        </div>
      )) : <div className="bg-white p-32 rounded-[4rem] text-center border-4 border-dashed border-slate-100 text-slate-400 font-black">No leads found.</div>}
    </div>
  </motion.div>
);

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
      {icon === 'tag' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
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
