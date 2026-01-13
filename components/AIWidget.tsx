
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WidgetState, EstimateTask, EstimationResult, BusinessConfig, UpsellSuggestion } from '../types.ts';
import { getEstimate, dispatchLead } from '../services/geminiService.ts';

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
  const [selectedUpsells, setSelectedUpsells] = useState<UpsellSuggestion[]>([]);
  const [loadingMsg, setLoadingMsg] = useState('Checking my toolbox...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [leadInfo, setLeadInfo] = useState({ 
    name: '', 
    email: '', 
    phone: '', 
    notes: '',
    date: '',
    time: ''
  });

  useEffect(() => {
    try {
      if (state === WidgetState.CLOSED) {
        window.parent.postMessage('close', '*');
      } else {
        window.parent.postMessage('open', '*');
      }
    } catch (e) {
      // Cross-origin safe
    }
  }, [state]);

  const toggle = () => {
    setErrorMessage(null);
    setNeedsKey(false);
    setState(state === WidgetState.CLOSED ? WidgetState.IDLE : WidgetState.CLOSED);
    if (state === WidgetState.CLOSED) {
      setSelectedUpsells([]);
    }
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
    const aiStudio = (window as any).aistudio;
    if (aiStudio?.openSelectKey) {
      await aiStudio.openSelectKey();
      setNeedsKey(false);
      setErrorMessage(null);
      // Proceed immediately assuming selection will be handled
    }
  };

  const handleEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.description.trim()) return;
    
    // Safety check for API key presence
    const apiKey = typeof process !== 'undefined' ? process.env.API_KEY : undefined;
    if (!apiKey || apiKey.trim() === "") {
      const aiStudio = (window as any).aistudio;
      if (aiStudio) {
        setNeedsKey(true);
        setErrorMessage("Please setup your API Key to enable AI estimation.");
        return;
      }
    }

    setErrorMessage(null);
    setNeedsKey(false);
    setSelectedUpsells([]);
    setState(WidgetState.LOADING);
    
    const messages = ['Analyzing scope...', 'Comparing labor rates...', 'Checking material costs...', 'Finalizing estimate...'];
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
      const msg = err.message || "";
      
      // Mandatory: Handle "Requested entity was not found" by prompting for re-selection
      if (msg.includes('Requested entity was not found')) {
        setNeedsKey(true);
        setErrorMessage("Requested project not found. Please select a valid paid project with billing enabled.");
        setState(WidgetState.IDLE);
        return;
      }

      // Handle missing or invalid key errors from the SDK
      if (msg.includes('API Key') || msg.includes('API_KEY') || msg.includes('set when running in a browser')) {
        setNeedsKey(true);
        setErrorMessage("Gemini API Key required. Please click setup to connect your account.");
      } else {
        setErrorMessage(msg || "Failed to generate estimate. Please try again.");
      }
      setState(WidgetState.IDLE);
    } finally {
      clearInterval(interval);
    }
  };

  const toggleUpsell = (upsell: UpsellSuggestion) => {
    setSelectedUpsells(prev => {
      const isAlreadySelected = prev.find(item => item.label === upsell.label);
      if (isAlreadySelected) {
        return prev.filter(item => item.label !== upsell.label);
      } else {
        return [...prev, upsell];
      }
    });
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState(WidgetState.LOADING);
    setLoadingMsg("Booking your pro...");
    
    const upsellNotes = selectedUpsells.length > 0 
      ? `\n\nSelected Add-ons:\n${selectedUpsells.map(u => `- ${u.label} (${u.price})`).join('\n')}`
      : '';
      
    try {
      if (result) {
        await dispatchLead({ ...leadInfo, notes: task.description + upsellNotes }, result, config);
      }
      setState(WidgetState.SUCCESS);
    } catch (err) {
      setState(WidgetState.SUCCESS);
    }
  };

  const primaryColor = config.primaryColor || '#f97316';
  const zipLabel = config.zipCodeLabel || 'Zip Code';

  return (
    <div className="fixed bottom-0 right-0 w-[440px] h-fit max-h-[90vh] pointer-events-none flex flex-col justify-end items-end p-6 z-[999999]">
      <AnimatePresence mode="wait">
        {state !== WidgetState.CLOSED && (
          <motion.div 
            key="widget-panel"
            initial={{ opacity: 0, y: 50, scale: 0.9 }} 
            animate={{ opacity: 1, y: 0, scale: 1 }} 
            exit={{ opacity: 0, y: 50, scale: 0.9 }} 
            className="w-full bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col mb-6 pointer-events-auto widget-shadow"
          >
            <header style={{ backgroundColor: primaryColor }} className="p-6 text-white shrink-0 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-10 -mt-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
              <div className="flex justify-between items-center relative z-10">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <img src={config.profilePic} className="w-12 h-12 rounded-xl object-cover border-2 border-white/20 shadow-md" alt="Avatar" />
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-lg tracking-tight leading-none">{config.headerTitle}</h3>
                    <p className="text-white/70 text-[10px] font-black uppercase tracking-widest mt-1">{config.headerSubtitle}</p>
                  </div>
                </div>
                <button 
                  onClick={toggle} 
                  className="w-9 h-9 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </header>

            <div className="p-7 bg-slate-50/30 flex-1 overflow-y-auto custom-scrollbar min-h-[380px] max-h-[500px]">
              <AnimatePresence mode="wait">
                {state === WidgetState.IDLE && (
                  <motion.form 
                    key="idle" 
                    initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                    onSubmit={handleEstimate} 
                    className="space-y-5"
                  >
                    {errorMessage && (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start space-x-3">
                        <div className="shrink-0 mt-0.5 text-red-500">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-[11px] text-red-700 font-bold leading-relaxed">{errorMessage}</p>
                          {needsKey && (
                            <button 
                              type="button" onClick={openKeyDialog}
                              className="mt-2 px-3 py-1.5 bg-red-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-sm"
                            >
                              Setup Key
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Describe the repair</label>
                      </div>
                      <textarea 
                        required 
                        value={task.description} 
                        onChange={e => setTask({...task, description: e.target.value})} 
                        className="w-full p-5 rounded-[1.5rem] border-2 border-slate-100 text-sm h-32 focus:border-orange-500 outline-none transition-all shadow-sm bg-white focus:shadow-lg resize-none" 
                        placeholder="e.g. My sink is clogged and there's water pooling under the cabinet..." 
                      />
                      {config.suggestedQuestions && config.suggestedQuestions.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {config.suggestedQuestions.map((q, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setTask({ ...task, description: q })}
                              className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-[10px] font-bold text-slate-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-all shadow-sm whitespace-nowrap"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{zipLabel}</label>
                        <input required value={task.zipCode} onChange={e => setTask({...task, zipCode: e.target.value})} className="w-full p-4 rounded-2xl border-2 border-slate-100 text-sm focus:border-orange-500 outline-none shadow-sm bg-white" placeholder={zipLabel} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Urgency</label>
                        <select value={task.urgency} onChange={e => setTask({...task, urgency: e.target.value})} className="w-full p-4 rounded-2xl border-2 border-slate-100 text-sm focus:border-orange-500 outline-none shadow-sm bg-white appearance-none cursor-pointer">
                          <option value="within-3-days">Within 3 Days</option>
                          <option value="same-day">Same Day</option>
                          <option value="flexible">Flexible</option>
                        </select>
                      </div>
                    </div>

                    <div 
                      onClick={() => fileInputRef.current?.click()} 
                      className="p-4 bg-white border-2 border-dashed border-slate-200 rounded-[1.5rem] text-center cursor-pointer hover:border-orange-400 transition-all group shadow-sm"
                    >
                      {task.image ? (
                        <div className="flex items-center justify-center space-x-3">
                          <div className="relative">
                            <img src={task.image} className="w-10 h-10 rounded-lg object-cover shadow-sm border border-slate-100" alt="Job" />
                            <div className="absolute -top-1.5 -right-1.5 bg-green-500 text-white rounded-full p-0.5"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg></div>
                          </div>
                          <span className="text-[9px] font-black text-green-600 uppercase tracking-widest">Photo Attached</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <div className="w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center mb-1 group-hover:bg-orange-50 transition-colors">
                            <svg className="w-4 h-4 text-slate-400 group-hover:text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Add a photo (Optional)</span>
                        </div>
                      )}
                      <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                    </div>

                    <button 
                      type="submit" 
                      style={{ backgroundColor: primaryColor }} 
                      className="w-full py-5 text-white font-black text-lg rounded-[1.5rem] shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-95 transition-all mt-2"
                    >
                      Get Instant Quote
                    </button>
                  </motion.form>
                )}

                {state === WidgetState.LOADING && (
                  <motion.div 
                    key="loading" 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="py-24 text-center space-y-6"
                  >
                    <div className="relative w-16 h-16 mx-auto">
                      <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                      <div 
                        className="absolute inset-0 border-4 border-t-transparent rounded-full animate-spin" 
                        style={{ borderColor: `${primaryColor} transparent transparent transparent` }}
                      ></div>
                    </div>
                    <div className="space-y-2">
                      <p className="font-black text-slate-800 text-xs uppercase tracking-[0.2em]">{loadingMsg}</p>
                      <p className="text-slate-400 text-[10px] font-medium italic">Calculating rates based on your area...</p>
                    </div>
                  </motion.div>
                )}

                {state === WidgetState.RESULT && result && (
                  <motion.div 
                    key="result" 
                    initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                    className="space-y-5 pb-4"
                  >
                    <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl text-center relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: primaryColor }}></div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Estimated Total</p>
                      <p className="text-5xl font-black tracking-tight" style={{ color: primaryColor }}>{result.estimatedCostRange}</p>
                      {selectedUpsells.length > 0 && (
                        <p className="text-[10px] font-bold text-slate-500 mt-2 uppercase tracking-widest">
                          + {selectedUpsells.length} Add-on{selectedUpsells.length > 1 ? 's' : ''} Selected
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-4 font-bold uppercase tracking-widest opacity-60 italic">Includes labor & materials</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Labor</p>
                        <p className="text-sm font-extrabold text-slate-800">{result.laborEstimate}</p>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Timing</p>
                        <p className="text-sm font-extrabold text-slate-800">{result.timeEstimate || "1-2 Days"}</p>
                      </div>
                    </div>
                    
                    {result.suggestedUpsells && result.suggestedUpsells.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Pro Recommendations</p>
                        {result.suggestedUpsells.map((upsell, idx) => {
                          const isSelected = selectedUpsells.some(u => u.label === upsell.label);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => toggleUpsell(upsell)}
                              className={`w-full text-left p-4 rounded-2xl border transition-all flex justify-between items-center group ${
                                isSelected 
                                  ? 'bg-orange-50 border-orange-400 shadow-md' 
                                  : 'bg-white border-slate-100 hover:border-orange-200 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex-1 pr-3">
                                <div className="flex items-center gap-2">
                                  {isSelected && (
                                    <div className="w-4 h-4 bg-orange-600 rounded-full flex items-center justify-center">
                                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                  )}
                                  <p className={`font-bold text-xs leading-tight ${isSelected ? 'text-orange-900' : 'text-slate-800'}`}>
                                    {upsell.label}
                                  </p>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{upsell.reason}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`font-black text-sm ${isSelected ? 'text-orange-600' : 'text-slate-600 group-hover:text-orange-600'}`}>
                                  {upsell.price}
                                </p>
                                <span className="text-[8px] font-black uppercase tracking-widest opacity-60">
                                  {isSelected ? 'Remove' : 'Add'}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <button 
                      onClick={() => setState(WidgetState.LEAD_FORM)} 
                      style={{ backgroundColor: primaryColor }} 
                      className="w-full py-5 text-white font-black text-lg rounded-[1.5rem] shadow-xl hover:shadow-2xl transition-all active:scale-95"
                    >
                      Book Professional
                    </button>
                    <button 
                      onClick={() => { setState(WidgetState.IDLE); setSelectedUpsells([]); }} 
                      className="w-full py-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-slate-600 transition-colors"
                    >
                      ← Edit Project Details
                    </button>
                  </motion.div>
                )}

                {state === WidgetState.LEAD_FORM && (
                  <motion.form 
                    key="lead" 
                    initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} 
                    onSubmit={handleLeadSubmit} 
                    className="space-y-4"
                  >
                    <div className="text-center mb-6">
                      <h4 className="font-black text-2xl text-slate-800 tracking-tight">Lock it In</h4>
                      <p className="text-slate-400 text-xs font-medium mt-1">Leave your details and we'll call you to confirm.</p>
                    </div>
                    
                    <div className="space-y-3">
                      <input required placeholder="Your Full Name" value={leadInfo.name} onChange={e => setLeadInfo({...leadInfo, name: e.target.value})} className="w-full p-5 rounded-2xl border-2 border-slate-100 text-sm outline-none focus:border-orange-500 bg-white shadow-sm transition-all" />
                      <input required type="email" placeholder="Email Address" value={leadInfo.email} onChange={e => setLeadInfo({...leadInfo, email: e.target.value})} className="w-full p-5 rounded-2xl border-2 border-slate-100 text-sm outline-none focus:border-orange-500 bg-white shadow-sm transition-all" />
                      <input required type="tel" placeholder="Phone Number" value={leadInfo.phone} onChange={e => setLeadInfo({...leadInfo, phone: e.target.value})} className="w-full p-5 rounded-2xl border-2 border-slate-100 text-sm outline-none focus:border-orange-500 bg-white shadow-sm transition-all" />
                    </div>

                    <button 
                      type="submit" 
                      style={{ backgroundColor: primaryColor }} 
                      className="w-full py-5 text-white font-black text-lg rounded-[1.5rem] shadow-xl mt-4 active:scale-95 transition-all"
                    >
                      Request Booking
                    </button>
                    <button 
                      type="button" onClick={() => setState(WidgetState.RESULT)} 
                      className="w-full py-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-slate-600 transition-colors"
                    >
                      ← Back to Estimate
                    </button>
                  </motion.form>
                )}

                {state === WidgetState.SUCCESS && (
                  <motion.div 
                    key="success" 
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} 
                    className="py-20 text-center space-y-8"
                  >
                    <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto shadow-inner border border-green-100">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div className="space-y-2 px-4">
                      <h3 className="font-black text-2xl text-slate-800 tracking-tight">Request Received!</h3>
                      <p className="text-slate-400 text-sm font-medium leading-relaxed">We've notified our pro team. Expect a call within 2-4 business hours.</p>
                    </div>
                    <button 
                      onClick={() => { setState(WidgetState.IDLE); setSelectedUpsells([]); }} 
                      style={{ color: primaryColor }} 
                      className="font-black text-[11px] uppercase tracking-[0.2em] pt-8 block w-full text-center hover:opacity-70 transition-opacity"
                    >
                      New Estimation
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <footer className="px-7 py-4 bg-white border-t border-slate-50 flex justify-center items-center">
              <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest text-center">AI generated estimates for informational purposes only</p>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button 
        whileHover={{ scale: 1.05 }} 
        whileTap={{ scale: 0.9 }}
        onClick={toggle} 
        style={{ backgroundColor: state === WidgetState.CLOSED ? primaryColor : '#fff' }} 
        className={`w-20 h-20 rounded-[2.2rem] flex items-center justify-center shadow-2xl pointer-events-auto border-4 ${state === WidgetState.CLOSED ? 'text-white border-transparent animate-pulse-subtle' : 'text-slate-600 border-white widget-shadow'} transition-colors duration-500`}
      >
        <AnimatePresence mode="wait">
          {state === WidgetState.CLOSED ? (
            <motion.div
              key="icon-closed"
              initial={{ rotate: -45, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 45, opacity: 0 }}
            >
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </motion.div>
          ) : (
            <motion.div
              key="icon-open"
              initial={{ rotate: 45, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -45, opacity: 0 }}
            >
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
};

export default AIWidget;
