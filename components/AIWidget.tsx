
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WidgetState, EstimateTask, EstimationResult, BusinessConfig } from '../types';
import { getEstimate, dispatchLead } from '../services/geminiService';

interface Props {
  config: BusinessConfig;
}

const AIWidget: React.FC<Props> = ({ config }) => {
  const [state, setState] = useState<WidgetState>(WidgetState.CLOSED);
  const [task, setTask] = useState<EstimateTask>({
    description: '',
    urgency: 'within-3-days',
    zipCode: '',
  });
  const [result, setResult] = useState<EstimationResult | null>(null);
  const [loadingMsg, setLoadingMsg] = useState('Consulting toolbox...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [leadInfo, setLeadInfo] = useState<any>({ 
    name: '', 
    email: '', 
    phone: '', 
    notes: '',
    date: '',
    time: ''
  });

  useEffect(() => {
    if (state === WidgetState.CLOSED) {
      window.parent.postMessage('close', '*');
    } else {
      window.parent.postMessage('open', '*');
    }
  }, [state]);

  const toggle = () => {
    setErrorMessage(null);
    setNeedsKey(false);
    setState(state === WidgetState.CLOSED ? WidgetState.IDLE : WidgetState.CLOSED);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setTask(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const openKeyDialog = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setNeedsKey(false);
      setErrorMessage(null);
    }
  };

  const handleEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setNeedsKey(false);
    setState(WidgetState.LOADING);
    
    const messages = ['Analyzing project...', 'Checking local rates...', 'Calculating materials...', 'Finalizing estimate...'];
    let i = 0;
    const interval = setInterval(() => {
      setLoadingMsg(messages[i % messages.length]);
      i++;
    }, 1200);

    try {
      const res = await getEstimate(task, config);
      setResult(res);
      setState(WidgetState.RESULT);
    } catch (err: any) {
      console.error("Estimation Error:", err);
      if (err.message === "MODEL_NOT_FOUND") {
        setNeedsKey(true);
        setErrorMessage("Model configuration error. Please ensure your API key is active.");
      } else {
        setErrorMessage(err.message || "Something went wrong. Please check your connection.");
      }
      setState(WidgetState.IDLE);
    } finally {
      clearInterval(interval);
    }
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState(WidgetState.LOADING);
    try {
      if (result) await dispatchLead({ ...leadInfo, notes: task.description }, result, config);
      setState(WidgetState.SUCCESS);
    } catch (err) {
      setState(WidgetState.SUCCESS);
    }
  };

  const primaryColor = config.primaryColor || '#f97316';

  return (
    <div className="fixed bottom-0 right-0 w-[420px] h-[750px] pointer-events-none flex flex-col justify-end items-end p-6">
      <AnimatePresence>
        {state !== WidgetState.CLOSED && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }} 
            animate={{ opacity: 1, y: 0, scale: 1 }} 
            exit={{ opacity: 0, y: 20, scale: 0.95 }} 
            className="w-full bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col mb-4 pointer-events-auto max-h-[700px]"
          >
            <header style={{ backgroundColor: primaryColor }} className="p-6 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-3">
                <img src={config.profilePic} className="w-12 h-12 rounded-xl object-cover border-2 border-white/20" />
                <div>
                  <h3 className="font-black text-lg">{config.headerTitle}</h3>
                  <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">{config.headerSubtitle}</p>
                </div>
              </div>
              <button onClick={toggle} className="text-white/50 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </header>

            <div className="p-6 bg-slate-50/50 flex-1 overflow-y-auto custom-scrollbar">
              <AnimatePresence mode="wait">
                {state === WidgetState.IDLE && (
                  <motion.form key="idle" onSubmit={handleEstimate} className="space-y-4">
                    {errorMessage && (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-2xl">
                        <p className="text-[10px] text-red-600 font-bold mb-2">{errorMessage}</p>
                        {needsKey && (
                          <button 
                            type="button"
                            onClick={openKeyDialog}
                            className="w-full py-2 bg-red-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg"
                          >
                            Update Key Settings
                          </button>
                        )}
                      </div>
                    )}
                    
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Describe the project</label>
                    <textarea required value={task.description} onChange={e => setTask({...task, description: e.target.value})} className="w-full p-4 rounded-2xl border-2 border-slate-100 text-sm h-28 focus:border-orange-500 outline-none transition-all shadow-sm" placeholder="Need to fix a leak..." />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <input required value={task.zipCode} onChange={e => setTask({...task, zipCode: e.target.value})} className="w-full p-4 rounded-2xl border-2 border-slate-100 text-sm focus:border-orange-500 outline-none shadow-sm" placeholder="Zip Code" />
                      <select value={task.urgency} onChange={e => setTask({...task, urgency: e.target.value})} className="w-full p-4 rounded-2xl border-2 border-slate-100 text-sm focus:border-orange-500 outline-none shadow-sm bg-white">
                        <option value="within-3-days">Within 3 Days</option>
                        <option value="same-day">Same Day</option>
                        <option value="flexible">Flexible</option>
                      </select>
                    </div>

                    <div onClick={() => fileInputRef.current?.click()} className="p-4 bg-white border-2 border-dashed border-slate-200 rounded-2xl text-center cursor-pointer hover:border-orange-400 transition-colors group">
                      {task.image ? (
                        <div className="flex items-center justify-center space-x-3">
                          <img src={task.image} className="w-10 h-10 rounded-lg object-cover" />
                          <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Photo Attached</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <svg className="w-6 h-6 text-slate-300 group-hover:text-orange-500 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Add a Photo</span>
                        </div>
                      )}
                      <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                    </div>

                    <button type="submit" style={{ backgroundColor: primaryColor }} className="w-full py-5 text-white font-black rounded-2xl shadow-xl active:scale-95 transition-all mt-2">Get Estimate</button>
                  </motion.form>
                )}

                {state === WidgetState.LOADING && (
                  <div className="py-20 text-center space-y-4">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-orange-600 rounded-full animate-spin mx-auto" style={{ borderTopColor: primaryColor }}></div>
                    <p className="font-black text-slate-400 text-[10px] uppercase tracking-widest animate-pulse">{loadingMsg}</p>
                  </div>
                )}

                {state === WidgetState.RESULT && result && (
                  <motion.div key="result" className="space-y-4 pb-4">
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estimated Total</p>
                      <p className="text-4xl font-black" style={{ color: primaryColor }}>{result.estimatedCostRange}</p>
                    </div>

                    {result.suggestedUpsells && result.suggestedUpsells.length > 0 && (
                      <div className="space-y-2">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Recommended Add-ons:</p>
                         {result.suggestedUpsells.map((upsell, idx) => (
                           <div key={idx} className="bg-orange-50 border border-orange-100 p-3 rounded-xl flex justify-between items-center">
                             <div className="flex-1 pr-3">
                               <p className="font-bold text-[11px] text-orange-900 leading-tight">{upsell.label}</p>
                               <p className="text-[9px] text-orange-700 italic leading-tight">{upsell.reason}</p>
                             </div>
                             <div className="text-right">
                               <p className="font-black text-xs text-orange-600">{upsell.price}</p>
                             </div>
                           </div>
                         ))}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-3 rounded-xl border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase">Labor</p><p className="text-xs font-bold">{result.laborEstimate}</p></div>
                      <div className="bg-white p-3 rounded-xl border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase">Materials</p><p className="text-xs font-bold">{result.materialsEstimate}</p></div>
                    </div>
                    
                    <button onClick={() => setState(WidgetState.LEAD_FORM)} style={{ backgroundColor: primaryColor }} className="w-full py-5 text-white font-black rounded-2xl shadow-xl active:scale-95 transition-all">Book Service</button>
                    <button onClick={() => setState(WidgetState.IDLE)} className="w-full text-[10px] font-black text-slate-400 uppercase tracking-widest underline opacity-50 hover:opacity-100 transition-opacity">Start Over</button>
                  </motion.div>
                )}

                {state === WidgetState.LEAD_FORM && (
                  <motion.form key="lead" onSubmit={handleLeadSubmit} className="space-y-3">
                    <h4 className="font-black text-xl text-center mb-4 text-slate-800">Final Step</h4>
                    <input required placeholder="Name" value={leadInfo.name} onChange={e => setLeadInfo({...leadInfo, name: e.target.value})} className="w-full p-4 rounded-xl border-2 border-slate-100 text-sm outline-none focus:border-orange-500 shadow-sm" />
                    <input required type="email" placeholder="Email" value={leadInfo.email} onChange={e => setLeadInfo({...leadInfo, email: e.target.value})} className="w-full p-4 rounded-xl border-2 border-slate-100 text-sm outline-none focus:border-orange-500 shadow-sm" />
                    <input required type="tel" placeholder="Phone" value={leadInfo.phone} onChange={e => setLeadInfo({...leadInfo, phone: e.target.value})} className="w-full p-4 rounded-xl border-2 border-slate-100 text-sm outline-none focus:border-orange-500 shadow-sm" />
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Preferred Date</label>
                        <input type="date" value={leadInfo.date} onChange={e => setLeadInfo({...leadInfo, date: e.target.value})} className="w-full p-3 rounded-xl border-2 border-slate-100 text-xs outline-none focus:border-orange-500 shadow-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Preferred Time</label>
                        <input type="time" value={leadInfo.time} onChange={e => setLeadInfo({...leadInfo, time: e.target.value})} className="w-full p-3 rounded-xl border-2 border-slate-100 text-xs outline-none focus:border-orange-500 shadow-sm" />
                      </div>
                    </div>

                    <button type="submit" style={{ backgroundColor: primaryColor }} className="w-full py-5 text-white font-black rounded-2xl shadow-xl mt-2">Send Request</button>
                  </motion.form>
                )}

                {state === WidgetState.SUCCESS && (
                  <div className="py-16 text-center space-y-4">
                    <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg></div>
                    <h3 className="font-black text-2xl text-slate-800">Request Sent</h3>
                    <p className="text-slate-400 text-sm font-medium">A professional will contact you soon.</p>
                    <button onClick={() => setState(WidgetState.IDLE)} style={{ color: primaryColor }} className="font-black text-xs uppercase tracking-widest pt-4 block w-full text-center">Start New</button>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button 
        whileHover={{ scale: 1.05 }} 
        whileTap={{ scale: 0.95 }}
        onClick={toggle} 
        style={{ backgroundColor: state === WidgetState.CLOSED ? primaryColor : '#fff' }} 
        className={`w-20 h-20 rounded-[2.5rem] flex items-center justify-center shadow-2xl pointer-events-auto border-4 ${state === WidgetState.CLOSED ? 'text-white border-transparent' : 'text-slate-600 border-white'}`}
      >
        {state === WidgetState.CLOSED ? (
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" /></svg>
        ) : (
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
        )}
      </motion.button>
    </div>
  );
};

export default AIWidget;
