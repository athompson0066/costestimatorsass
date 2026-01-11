
import React, { useState, useRef } from 'react';
import { WidgetState, EstimateTask, EstimationResult, BusinessConfig } from '../types';
import { getEstimate } from '../services/geminiService';

const HandymanWidget: React.FC = () => {
  const [state, setState] = useState<WidgetState>(WidgetState.CLOSED);
  const [task, setTask] = useState<EstimateTask>({
    description: '',
    urgency: 'within-3-days',
    zipCode: '',
  });
  const [result, setResult] = useState<EstimationResult | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Checking my toolbox...');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handymanConfig: BusinessConfig = {
    name: 'SwiftFix Handyman',
    primaryColor: '#ea580c',
    headerTitle: 'SwiftFix Handyman AI',
    headerSubtitle: 'Instant Project Estimation',
    profilePic: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=128&h=128&auto=format&fit=crop',
    hoverTitle: 'Get Instant Quote',
    widgetIcon: 'calculator',
    services: ['Plumbing', 'Electrical', 'Furniture Assembly', 'Painting'],
    pricingRules: 'Minimum service fee is $95. Labor is $85/hour. Materials are marked up 15%. Weekend/Urgent requests have a 25% surcharge.',
    systemPrompt: 'You are a highly skilled professional handyman consultant. You are helpful, precise, and polite. When giving estimates, explain the reasoning behind the costs to build trust with the client. Always look for ways to add value by recommending preventative maintenance.',
    googleSheetUrl: '',
    useSheetData: false,
    pricingSource: 'manual',
    corePricingItems: [],
    smartAddons: [],
    manualPriceList: [],
    suggestedQuestions: ['Fix leak?', 'Mount TV?', 'Patch wall?'],
    leadGenConfig: {
      enabled: false,
      destination: 'email',
      targetEmail: '',
      resendApiKey: '',
      webhookUrl: '',
      googleSheetWebhookUrl: '',
      slackWebhookUrl: '',
      fields: {
        name: { visible: true, required: true },
        email: { visible: true, required: true },
        phone: { visible: true, required: true },
        notes: { visible: false, required: false },
        serviceType: { visible: false, required: false },
        date: { visible: false, required: false },
        time: { visible: false, required: false },
      }
    },
    defaultLanguage: 'en',
  };

  const toggleWidget = () => {
    setState(state === WidgetState.CLOSED ? WidgetState.IDLE : WidgetState.CLOSED);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setTask(prev => ({ ...prev, image: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const handleEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.description || !task.zipCode) return;

    setState(WidgetState.LOADING);
    try {
      const est = await getEstimate(task, handymanConfig);
      setResult(est);
      setState(WidgetState.RESULT);
    } catch (error) {
      console.error(error);
      alert('Estimation failed. Please try again.');
      setState(WidgetState.IDLE);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
      {state !== WidgetState.CLOSED && (
        <div className="w-[380px] sm:w-[420px] max-h-[80vh] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col mb-4">
          <div className="bg-orange-600 p-6 text-white flex justify-between items-center">
            <div><h3 className="font-bold text-lg leading-tight">AI Estimator</h3><p className="text-orange-100 text-xs">Instantly estimate your project</p></div>
            <button onClick={toggleWidget} className="p-2 hover:bg-white/10 rounded-full transition"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            {state === WidgetState.IDLE && (
              <form onSubmit={handleEstimate} className="space-y-4">
                <textarea required value={task.description} onChange={(e) => setTask({ ...task, description: e.target.value })} placeholder="What needs fixing?" className="w-full p-4 rounded-xl border border-slate-200 text-sm h-28" />
                <div className="grid grid-cols-2 gap-4">
                  <input required value={task.zipCode} onChange={(e) => setTask({ ...task, zipCode: e.target.value })} placeholder="Zip Code" className="w-full p-3 rounded-xl border border-slate-200 text-sm" />
                  <select value={task.urgency} onChange={(e) => setTask({ ...task, urgency: e.target.value as any })} className="w-full p-3 rounded-xl border border-slate-200 text-sm"><option value="same-day">Same Day</option><option value="next-day">Next Day</option><option value="within-3-days">Within 3 Days</option><option value="flexible">Flexible</option></select>
                </div>
                <button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all">Get AI Estimate</button>
              </form>
            )}
            {state === WidgetState.RESULT && result && (
              <div className="space-y-6">
                <div className="bg-orange-50 border border-orange-100 p-6 rounded-2xl text-center"><p className="text-4xl font-black text-orange-600">{result.estimatedCostRange}</p></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-200"><p className="text-[10px] text-slate-500 font-bold uppercase">Labor</p><p className="text-sm font-semibold">{result.laborEstimate}</p></div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200"><p className="text-[10px] text-slate-500 font-bold uppercase">Materials</p><p className="text-sm font-semibold">{result.materialsEstimate}</p></div>
                </div>
                <button onClick={() => setState(WidgetState.IDLE)} className="w-full border border-slate-200 text-slate-600 font-bold py-3 rounded-xl text-sm">Start Over</button>
              </div>
            )}
          </div>
        </div>
      )}
      <button onClick={toggleWidget} className="w-16 h-16 rounded-full flex items-center justify-center text-white shadow-2xl transition-all duration-300 transform active:scale-95 bg-orange-600 hover:bg-orange-700">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" /></svg>
      </button>
    </div>
  );
};

export default HandymanWidget;
