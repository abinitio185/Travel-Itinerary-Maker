
import React, { useState, useRef } from 'react';
import { TravelPackage, AppState, ItineraryDay, ThemeType, ThemeStyles, PricingRow } from './types';
import { parseItineraryFromText, generateDayImage, GeminiError } from './services/geminiService';

declare const mammoth: any;
declare const html2pdf: any;
declare const html2canvas: any;
declare const window: any;

const THEME_PRESETS: Record<ThemeType, ThemeStyles> = {
  luxe: {
    primaryColor: '#001f3f',
    accentColor: '#D4AF37',
    backgroundColor: '#FFFDF5',
    headingFont: "'Playfair Display', serif",
    headingWeight: '700',
    headingStyle: 'normal',
    bodyFont: "'Lora', serif",
    bodyWeight: '400',
    bodyStyle: 'normal'
  },
  vanguard: {
    primaryColor: '#000000',
    accentColor: '#333333',
    backgroundColor: '#ffffff',
    headingFont: "'Inter', sans-serif",
    headingWeight: '900',
    headingStyle: 'normal',
    bodyFont: "'Inter', sans-serif",
    bodyWeight: '300',
    bodyStyle: 'normal'
  },
  wanderlust: {
    primaryColor: '#3E2723',
    accentColor: '#8D6E63',
    backgroundColor: '#F5F1E9',
    headingFont: "'Lora', serif",
    headingWeight: '700',
    headingStyle: 'italic',
    bodyFont: "'Lora', serif",
    bodyWeight: '400',
    bodyStyle: 'normal'
  }
};

const FONT_OPTIONS = [
  { name: 'Classic Serif (Playfair)', value: "'Playfair Display', serif" },
  { name: 'Elegant Serif (Lora)', value: "'Lora', serif" },
  { name: 'Modern Sans (Inter)', value: "'Inter', sans-serif" },
  { name: 'Handwritten (Caveat)', value: "'Caveat', cursive" }
];

const WEIGHT_OPTIONS = [
  { name: 'Light', value: '300' },
  { name: 'Normal', value: '400' },
  { name: 'Medium', value: '500' },
  { name: 'Bold', value: '700' },
  { name: 'Black', value: '900' }
];

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    step: 'upload',
    packageData: null,
    isLoading: false,
    error: null
  });

  const [activeRegenIndex, setActiveRegenIndex] = useState<number | null>(null);
  const [activeUploadIndex, setActiveUploadIndex] = useState<number | null>(null); // -1 for cover
  const [pendingUploadImage, setPendingUploadImage] = useState<string | null>(null);
  const [regenPrompt, setRegenPrompt] = useState("");
  const [pdfOrientation, setPdfOrientation] = useState<'portrait' | 'landscape'>('portrait');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const flyerRef = useRef<HTMLDivElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const ensureApiKey = async () => {
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
        return true;
      }
    }
    return true;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      let textContent = '';
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        try {
            const result = await mammoth.extractRawText({ arrayBuffer });
            textContent = result.value;
        } catch (mErr: any) {
            throw new Error(`Failed to read .docx file: ${mErr.message}`);
        }
      } else if (file.name.endsWith('.txt') || file.name.endsWith('.doc')) {
        textContent = await file.text();
      } else {
        throw new Error("Unsupported format. Please upload a .docx, .doc, or .txt file.");
      }

      const parsedData = await parseItineraryFromText(textContent);
      const defaultTheme: ThemeType = 'luxe';
      setState({
        step: 'edit',
        packageData: {
          packageName: parsedData.packageName || 'Custom Travel Plan',
          destination: parsedData.destination || 'Global',
          duration: parsedData.duration || 'Custom Duration',
          currency: parsedData.currency || 'USD',
          pricing: parsedData.pricing || [{ label: 'Standard Price', value: '' }],
          inclusions: parsedData.inclusions || [],
          exclusions: parsedData.exclusions || [],
          itinerary: parsedData.itinerary || [],
          companyName: '',
          logoUrl: '',
          coverImageUrl: '',
          theme: defaultTheme,
          styles: THEME_PRESETS[defaultTheme]
        },
        isLoading: false,
        error: null
      });
    } catch (err: any) {
      setState(prev => ({ ...prev, isLoading: false, error: err.message }));
    }
  };

  const handleFieldChange = (field: keyof TravelPackage, value: any) => {
    setState(prev => ({
      ...prev,
      packageData: prev.packageData ? { ...prev.packageData, [field]: value } : null
    }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        handleFieldChange('logoUrl', event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePricingChange = (index: number, field: keyof PricingRow, value: string) => {
    if (!state.packageData) return;
    const newPricing = [...state.packageData.pricing];
    newPricing[index] = { ...newPricing[index], [field]: value };
    handleFieldChange('pricing', newPricing);
  };

  const addPricingRow = () => {
    if (!state.packageData) return;
    handleFieldChange('pricing', [...state.packageData.pricing, { label: 'New Category', value: '' }]);
  };

  const removePricingRow = (index: number) => {
    if (!state.packageData) return;
    const newPricing = state.packageData.pricing.filter((_, i) => i !== index);
    handleFieldChange('pricing', newPricing);
  };

  const handleStyleChange = (styleField: keyof ThemeStyles, value: any) => {
    if (!state.packageData) return;
    handleFieldChange('styles', { ...state.packageData.styles, [styleField]: value });
  };

  const handleThemeChange = (theme: ThemeType) => {
    if (!state.packageData) return;
    setState(prev => ({
      ...prev,
      packageData: prev.packageData ? {
        ...prev.packageData,
        theme,
        styles: { ...THEME_PRESETS[theme] }
      } : null
    }));
  };

  const handleDayChange = (index: number, field: keyof ItineraryDay, value: any) => {
    if (!state.packageData) return;
    const newItinerary = [...state.packageData.itinerary];
    newItinerary[index] = { ...newItinerary[index], [field]: value };
    handleFieldChange('itinerary', newItinerary);
  };

  const updateDayActivity = (dayIndex: number, actIndex: number, value: string) => {
    if (!state.packageData) return;
    const newItinerary = [...state.packageData.itinerary];
    const newActivities = [...newItinerary[dayIndex].activities];
    newActivities[actIndex] = value;
    newItinerary[dayIndex] = { ...newItinerary[dayIndex], activities: newActivities };
    handleFieldChange('itinerary', newItinerary);
  };

  const addDayActivity = (dayIndex: number) => {
    if (!state.packageData) return;
    const newItinerary = [...state.packageData.itinerary];
    newItinerary[dayIndex] = { 
      ...newItinerary[dayIndex], 
      activities: [...newItinerary[dayIndex].activities, "New Activity Pointer"] 
    };
    handleFieldChange('itinerary', newItinerary);
  };

  const removeDayActivity = (dayIndex: number, actIndex: number) => {
    if (!state.packageData) return;
    const newItinerary = [...state.packageData.itinerary];
    const newActivities = newItinerary[dayIndex].activities.filter((_, i) => i !== actIndex);
    newItinerary[dayIndex] = { ...newItinerary[dayIndex], activities: newActivities };
    handleFieldChange('itinerary', newItinerary);
  };

  const handleRegenerateImage = async (index: number) => {
    if (!state.packageData) return;
    const day = state.packageData.itinerary[index];
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    await ensureApiKey();
    try {
      const imageUrl = await generateDayImage(day.location, day.title, day.description || day.activities.join('. '), regenPrompt);
      handleDayChange(index, 'imageUrl', imageUrl);
      setActiveRegenIndex(null);
      setRegenPrompt("");
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        if (state.step === 'preview') {
          setPendingUploadImage(event.target.result as string);
          setActiveUploadIndex(index); // index -1 for cover
          setActiveRegenIndex(null);
        } else {
            if (index === -1) {
                handleFieldChange('coverImageUrl', event.target.result as string);
            } else {
                handleDayChange(index, 'imageUrl', event.target.result as string);
            }
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const downloadPDF = () => {
    if (!pdfRef.current) return;
    const element = pdfRef.current;
    setState(prev => ({ ...prev, isLoading: true }));
    const opt = {
      margin: 0,
      filename: `${state.packageData?.packageName || 'Itinerary'}.pdf`,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: { scale: 3, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: pdfOrientation }
    };
    html2pdf().set(opt).from(element).save().then(() => setState(prev => ({ ...prev, isLoading: false })));
  };

  const downloadFlyerJpeg = async () => {
    if (!flyerRef.current) return;
    setState(prev => ({ ...prev, isLoading: true }));
    const canvas = await html2canvas(flyerRef.current, { scale: 4, useCORS: true });
    const link = document.createElement('a');
    link.download = `${state.packageData?.packageName || 'Itinerary'}_Flyer.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 1.0);
    link.click();
    setState(prev => ({ ...prev, isLoading: false }));
  };

  return (
    <div className={`min-h-screen pb-20 font-sans transition-colors duration-500 bg-white`}>
      <header className="bg-white border-b px-8 py-5 flex justify-between items-center sticky top-0 z-50 shadow-sm no-print">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
            <span className="text-white font-serif text-xl font-bold">A</span>
          </div>
          <h1 className="text-2xl font-serif font-black tracking-tighter uppercase">Itinerary Architect</h1>
        </div>
        <div className="flex gap-4 items-center">
          {state.step === 'edit' && (
            <button onClick={() => setState(prev => ({ ...prev, step: 'preview' }))} className="btn-primary flex items-center gap-2 px-8">Preview Itinerary</button>
          )}
          {state.step === 'preview' && (
            <>
              <div className="flex items-center bg-gray-50 border border-gray-200 rounded-md p-1 mr-2">
                <button onClick={() => setPdfOrientation('portrait')} className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded transition-all ${pdfOrientation === 'portrait' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}>Portrait</button>
                <button onClick={() => setPdfOrientation('landscape')} className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded transition-all ${pdfOrientation === 'landscape' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}>Landscape</button>
              </div>
              <button onClick={() => setState(prev => ({ ...prev, step: 'edit' }))} className="btn-secondary">Back to Editor</button>
              <button onClick={downloadFlyerJpeg} className="btn-secondary">Export Flyer (JPEG)</button>
              <button onClick={downloadPDF} className="btn-primary px-8">Download PDF</button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-12 px-6">
        {state.isLoading && (
          <div className="fixed inset-0 bg-white/95 backdrop-blur-sm z-[100] flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-black mb-6"></div>
            <p className="text-xl font-serif italic text-gray-800">Architecting your journey...</p>
          </div>
        )}

        {state.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg mb-8 flex justify-between items-center">
            <span className="text-sm font-medium">{state.error}</span>
            <button onClick={() => setState(prev => ({ ...prev, error: null }))} className="text-2xl">&times;</button>
          </div>
        )}

        {state.step === 'upload' && (
          <div className="flex flex-col items-center justify-center py-20 luxury-card p-16 text-center max-w-2xl mx-auto border-2 border-dashed border-gray-200 hover:border-black transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-10 border shadow-inner">
               <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
            </div>
            <h2 className="text-4xl font-serif mb-6">Upload Document</h2>
            <p className="text-gray-500 mb-10 text-lg">Select a doc file with tour details. We'll automatically extract package information, itinerary pointers, and pricing.</p>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".docx,.txt,.doc" className="hidden" />
            <button className="btn-primary text-xl px-12 py-4">Choose File</button>
          </div>
        )}

        {state.step === 'edit' && state.packageData && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <aside className="lg:col-span-4 space-y-10">
              <section className="luxury-card p-8">
                <h3 className="text-xl font-serif font-bold mb-6 border-b pb-4">Branding</h3>
                <div className="space-y-6">
                  <div className="flex flex-col items-center gap-4 mb-4">
                    <div className="w-24 h-24 border border-dashed border-gray-200 rounded flex items-center justify-center overflow-hidden bg-zinc-50 relative group">
                      {state.packageData.logoUrl ? (
                        <>
                          <img src={state.packageData.logoUrl} alt="Company Logo" className="max-w-full max-h-full object-contain" />
                          <button 
                            onClick={() => handleFieldChange('logoUrl', '')}
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-gray-400 uppercase font-black">No Logo</span>
                      )}
                    </div>
                    <button 
                      onClick={() => logoInputRef.current?.click()}
                      className="text-[10px] font-black uppercase tracking-widest bg-zinc-100 px-4 py-2 rounded hover:bg-zinc-200 transition-colors"
                    >
                      {state.packageData.logoUrl ? 'Change Logo' : 'Upload Logo'}
                    </button>
                    <input type="file" ref={logoInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
                  </div>
                  <input className="w-full p-3 border border-gray-100 rounded-lg outline-none font-serif text-lg" placeholder="Agency Name" value={state.packageData.companyName || ''} onChange={e => handleFieldChange('companyName', e.target.value)} />
                </div>
              </section>

              <section className="luxury-card p-8">
                <h3 className="text-xl font-serif font-bold mb-6 border-b pb-4">Dynamic Pricing</h3>
                <div className="space-y-4">
                  <div className="flex gap-2 items-center mb-4">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Currency</label>
                    <input className="flex-1 p-2 border border-gray-100 rounded outline-none text-sm font-bold" value={state.packageData.currency} onChange={e => handleFieldChange('currency', e.target.value)} />
                  </div>
                  {state.packageData.pricing.map((p, idx) => (
                    <div key={idx} className="space-y-2 p-3 bg-zinc-50 rounded-lg group">
                      <div className="flex justify-between">
                        <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Category {idx + 1}</label>
                        <button onClick={() => removePricingRow(idx)} className="text-red-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100">&times;</button>
                      </div>
                      <input className="w-full p-2 border border-gray-100 rounded text-sm mb-1" placeholder="Label (e.g. Per Person)" value={p.label} onChange={e => handlePricingChange(idx, 'label', e.target.value)} />
                      <input className="w-full p-2 border border-gray-100 rounded text-sm" placeholder="Price (e.g. 5000)" value={p.value} onChange={e => handlePricingChange(idx, 'value', e.target.value)} />
                    </div>
                  ))}
                  <button onClick={addPricingRow} className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-xs uppercase font-bold text-gray-400 hover:border-black hover:text-black transition-all">+ Add Pricing Option</button>
                </div>
              </section>

              <section className="luxury-card p-8">
                <h3 className="text-xl font-serif font-bold mb-6 border-b pb-4">Typography</h3>
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Headings</label>
                    <select className="w-full p-2 border border-gray-100 rounded text-xs outline-none" value={state.packageData.styles.headingFont} onChange={(e) => handleStyleChange('headingFont', e.target.value)}>
                      {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Body Text</label>
                    <select className="w-full p-2 border border-gray-100 rounded text-xs outline-none" value={state.packageData.styles.bodyFont} onChange={(e) => handleStyleChange('bodyFont', e.target.value)}>
                      {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
                    </select>
                  </div>
                </div>
              </section>
            </aside>

            <section className="lg:col-span-8 space-y-8">
               <h3 className="text-3xl font-serif font-bold mb-4">Itinerary Flow</h3>
               {state.packageData.itinerary.map((day, idx) => (
                 <div key={idx} className="luxury-card p-10 space-y-6 relative group border-l-4 border-transparent hover:border-black transition-all">
                   <div className="absolute top-6 right-6 text-6xl font-serif opacity-5 select-none">0{day.day}</div>
                   <input className="w-full text-2xl font-serif font-bold border-b border-transparent focus:border-gray-200 outline-none pb-2 bg-transparent" value={day.title} onChange={e => handleDayChange(idx, 'title', e.target.value)} />
                   <input className="w-full p-3 border border-gray-50 rounded-lg outline-none bg-zinc-50/50" value={day.location} onChange={e => handleDayChange(idx, 'location', e.target.value)} />
                   
                   <div className="space-y-3">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Pointers</label>
                      {day.activities.map((act, actIdx) => (
                        <div key={actIdx} className="flex gap-2 group/act">
                           <input className="flex-1 p-2 border border-gray-50 rounded-lg outline-none text-sm bg-zinc-50/30" value={act} onChange={e => updateDayActivity(idx, actIdx, e.target.value)} />
                           <button onClick={() => removeDayActivity(idx, actIdx)} className="opacity-0 group-hover/act:opacity-100 text-red-300 hover:text-red-500">&times;</button>
                        </div>
                      ))}
                      <button onClick={() => addDayActivity(idx)} className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-black transition-colors">+ Add Activity</button>
                   </div>
                 </div>
               ))}
            </section>
          </div>
        )}

        {state.step === 'preview' && state.packageData && (
          <div className="flex flex-col items-center gap-12 w-full">
            <div 
              ref={pdfRef} 
              className={`itinerary-pdf-container shadow-2xl mb-20 overflow-hidden relative`}
              style={{
                backgroundColor: state.packageData.styles.backgroundColor,
                color: state.packageData.styles.primaryColor,
                fontFamily: state.packageData.styles.bodyFont,
                fontWeight: state.packageData.styles.bodyWeight,
                fontStyle: state.packageData.styles.bodyStyle,
                width: pdfOrientation === 'landscape' ? '297mm' : '210mm',
                minHeight: pdfOrientation === 'landscape' ? '210mm' : '297mm'
              }}
            >
              <style dangerouslySetInnerHTML={{ __html: `
                .itinerary-pdf-container h1, .itinerary-pdf-container h2, .itinerary-pdf-container h3, .itinerary-pdf-container h4 {
                  font-family: ${state.packageData.styles.headingFont};
                  font-weight: ${state.packageData.styles.headingWeight};
                  font-style: ${state.packageData.styles.headingStyle};
                  color: ${state.packageData.styles.primaryColor};
                }
              `}} />

              {/* COVER - With Custom Upload Capability */}
              <div ref={flyerRef} className="relative -mx-[20mm] -mt-[20mm] mb-12 flex flex-col overflow-hidden group/cover" style={{height: pdfOrientation === 'landscape' ? '210mm' : '297mm'}}>
                {state.packageData.coverImageUrl || state.packageData.itinerary[0]?.imageUrl ? (
                  <img src={state.packageData.coverImageUrl || state.packageData.itinerary[0]?.imageUrl} className="absolute inset-0 w-full h-full object-cover" alt="Cover" />
                ) : (
                  <div className="absolute inset-0 bg-zinc-900" />
                )}
                <div className="absolute inset-0 bg-black/40" />
                
                {/* Cover Overlay Action Area */}
                <div className="no-print absolute inset-0 opacity-0 group-hover/cover:opacity-100 transition-opacity flex flex-col items-center justify-center p-8 text-white z-20">
                    {activeUploadIndex === -1 && pendingUploadImage ? (
                        <div className="w-full max-w-md space-y-6 bg-black/90 p-8 rounded-xl border border-white/10 shadow-2xl backdrop-blur-md text-center">
                            <h4 className="text-sm font-black uppercase tracking-[0.2em]">Confirm New Cover?</h4>
                            <div className="w-full aspect-video rounded border border-white/20 overflow-hidden"><img src={pendingUploadImage} className="w-full h-full object-cover" /></div>
                            <div className="flex gap-3">
                                <button onClick={() => { handleFieldChange('coverImageUrl', pendingUploadImage); setActiveUploadIndex(null); setPendingUploadImage(null); }} className="flex-1 bg-green-500 text-white text-[10px] font-black uppercase py-4 rounded tracking-widest">Confirm</button>
                                <button onClick={() => { setActiveUploadIndex(null); setPendingUploadImage(null); }} className="px-6 py-4 border border-white/20 text-[10px] uppercase font-black rounded text-white/70 hover:text-white">Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <label className="px-8 py-4 bg-white text-black text-[10px] font-black uppercase rounded tracking-widest cursor-pointer shadow-2xl hover:scale-105 transition-transform">
                            Upload Custom Cover
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(-1, e)} />
                        </label>
                    )}
                </div>

                <div className="relative z-10 p-24 h-full flex flex-col text-white">
                  <div className="flex justify-between items-start">
                    {state.packageData.logoUrl ? (
                      <img src={state.packageData.logoUrl} className="h-12 object-contain brightness-0 invert" alt="Company Logo" />
                    ) : (
                      <span className="text-sm font-black uppercase tracking-[0.4em]">{state.packageData.companyName || 'ADVENTURE ARCHITECT'}</span>
                    )}
                  </div>
                  <div className="mt-auto">
                    <h1 className="text-8xl mb-8 leading-none tracking-tighter uppercase font-black text-white" style={{color: 'white'}}>{state.packageData.packageName}</h1>
                    <div className="w-24 h-1 bg-white mb-12" />
                    <div className="grid grid-cols-2 gap-20">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest opacity-60 mb-2">Destination</p>
                        <p className="text-3xl font-light">{state.packageData.destination}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest opacity-60 mb-2">Duration</p>
                        <p className="text-3xl font-light">{state.packageData.duration}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* INTRO */}
              <div className="py-20 text-center max-w-4xl mx-auto px-10">
                <h2 className="text-5xl mb-10 italic">Journey Beyond Boundaries</h2>
                <p className="text-xl leading-relaxed font-light opacity-80">Curated travel experiences designed for those who seek the extraordinary. Your adventure starts here.</p>
              </div>

              {/* ITINERARY */}
              <div className="py-20 space-y-64 px-10">
                {state.packageData.itinerary.map((day, idx) => (
                  <div key={idx} className="space-y-12 relative">
                    <div className="flex items-center gap-10">
                       <span className="text-9xl tracking-tighter leading-none opacity-5 font-black absolute -left-12 -top-12">0{day.day}</span>
                       <div className="relative z-10">
                          <span className="text-xs font-black uppercase tracking-widest opacity-40">Day 0{day.day}</span>
                          <h3 className="text-6xl tracking-tight leading-none">{day.title}</h3>
                       </div>
                    </div>
                    
                    <div className="relative group/img aspect-[16/9] overflow-hidden rounded-sm shadow-2xl bg-zinc-50">
                      {day.imageUrl ? <img src={day.imageUrl} className="w-full h-full object-cover" alt={day.title} /> : <div className="w-full h-full flex items-center justify-center text-zinc-200 uppercase tracking-widest text-xs">No Image</div>}
                      
                      <div className="no-print absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex flex-col items-center justify-center p-8 text-white z-20">
                        {activeRegenIndex === idx ? (
                          <div className="w-full max-w-sm space-y-4">
                            <textarea className="w-full bg-white/10 border border-white/20 rounded p-3 text-sm focus:outline-none h-24 resize-none text-white" placeholder="Custom AI Prompt..." value={regenPrompt} onChange={e => setRegenPrompt(e.target.value)} />
                            <div className="flex gap-2">
                               <button onClick={() => handleRegenerateImage(idx)} className="flex-1 bg-white text-black text-[10px] font-black uppercase py-3 rounded">Generate</button>
                               <button onClick={() => setActiveRegenIndex(null)} className="px-4 py-3 border border-white/20 text-[10px] uppercase font-black rounded">Cancel</button>
                            </div>
                          </div>
                        ) : activeUploadIndex === idx && pendingUploadImage ? (
                          <div className="w-full max-w-md space-y-6 bg-black/90 p-8 rounded-xl border border-white/10 shadow-2xl backdrop-blur-md text-center">
                             <div className="w-full aspect-video rounded border border-white/20 overflow-hidden"><img src={pendingUploadImage} className="w-full h-full object-cover" /></div>
                             <div className="flex gap-3">
                                <button onClick={() => { handleDayChange(idx, 'imageUrl', pendingUploadImage); setActiveUploadIndex(null); setPendingUploadImage(null); }} className="flex-1 bg-green-500 text-white text-[10px] font-black uppercase py-4 rounded tracking-widest">Confirm</button>
                                <button onClick={() => { setActiveUploadIndex(null); setPendingUploadImage(null); }} className="px-6 py-4 border border-white/20 text-[10px] uppercase font-black rounded text-white/70 hover:text-white">Cancel</button>
                             </div>
                          </div>
                        ) : (
                          <div className="flex gap-4">
                            <button onClick={() => setActiveRegenIndex(idx)} className="px-6 py-3 bg-white text-black text-[10px] font-black uppercase rounded tracking-widest shadow-xl">Regenerate (AI)</button>
                            <label className="px-6 py-3 border border-white text-white text-[10px] font-black uppercase rounded tracking-widest cursor-pointer">Upload<input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(idx, e)} /></label>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-6">
                       <ul className="space-y-4">
                          {day.activities.map((act, actI) => (
                            <li key={actI} className="flex gap-6 items-start">
                               <span className="text-xl font-light opacity-30 mt-[-4px]" style={{color: state.packageData.styles.accentColor}}>•</span>
                               <span className="text-lg leading-relaxed">{act}</span>
                            </li>
                          ))}
                       </ul>
                    </div>
                  </div>
                ))}
              </div>

              {/* PRICING SECTION - Dynamic Rows & Right-Down Position */}
              <div className="mt-40 py-24 -mx-[20mm] px-[30mm] border-t border-zinc-100" style={{backgroundColor: 'rgba(0,0,0,0.02)'}}>
                 <div className="max-w-4xl ml-auto flex flex-col items-end">
                    <h3 className="text-4xl mb-12 pb-4 border-b w-full text-right" style={{borderColor: state.packageData.styles.primaryColor}}>Investment Details</h3>
                    <div className="w-full grid grid-cols-1 gap-y-8">
                        {state.packageData.pricing.map((p, idx) => (
                        <div key={idx} className="flex justify-between items-baseline border-b border-zinc-200/50 pb-4">
                            <span className="font-black text-[12px] uppercase tracking-widest opacity-40">{p.label}</span>
                            <span className="text-4xl font-light">{state.packageData.currency} {p.value || '-'}</span>
                        </div>
                        ))}
                    </div>
                    <p className="mt-12 text-[10px] uppercase tracking-widest opacity-30 font-bold italic text-right">
                        * Prices are subject to change based on custom requirements and availability.
                    </p>
                 </div>
              </div>

              {/* LOGISTICS */}
              <div className="py-24 px-10 grid grid-cols-2 gap-24">
                <div>
                  <h4 className="text-[10px] uppercase tracking-widest font-black mb-10 opacity-30 border-b pb-2" style={{borderColor: state.packageData.styles.primaryColor}}>Inclusions</h4>
                  <ul className="space-y-4">
                    {state.packageData.inclusions.map((item, i) => <li key={i} className="flex gap-4 items-start text-sm font-light"><span className="opacity-20">/</span> {item}</li>)}
                  </ul>
                </div>
                <div>
                  <h4 className="text-[10px] uppercase tracking-widest font-black mb-10 opacity-30 border-b pb-2" style={{borderColor: state.packageData.styles.primaryColor}}>Exclusions</h4>
                  <ul className="space-y-4">
                    {state.packageData.exclusions.map((item, i) => <li key={i} className="flex gap-4 items-start text-sm font-light opacity-60"><span className="opacity-20">×</span> {item}</li>)}
                  </ul>
                </div>
              </div>

              {/* FOOTER */}
              <div className="py-20 text-center border-t border-gray-100 mt-20">
                 <p className="text-3xl italic mb-4">{state.packageData.companyName || 'Adventure Architect'}</p>
                 <p className="text-[8px] uppercase tracking-[0.5em] opacity-30 font-black">Bespoke Travel Planning • © 2025</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
