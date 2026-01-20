
import React, { useState, useRef } from 'react';
import { TravelPackage, AppState, ItineraryDay, ThemeType, ThemeStyles } from './types';
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
    bodyWeight: '400',
    bodyStyle: 'normal'
  },
  wanderlust: {
    primaryColor: '#3E2723',
    accentColor: '#8D6E63',
    backgroundColor: '#F5F1E9',
    headingFont: "'Lora', serif",
    headingWeight: '700',
    headingStyle: 'normal',
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
  const [activeUploadIndex, setActiveUploadIndex] = useState<number | null>(null);
  const [pendingUploadImage, setPendingUploadImage] = useState<string | null>(null);
  const [regenPrompt, setRegenPrompt] = useState("");
  const [pdfOrientation, setPdfOrientation] = useState<'portrait' | 'landscape'>('portrait');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const flyerRef = useRef<HTMLDivElement>(null);

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
            if (!textContent.trim()) {
                throw new Error("The uploaded .docx file appears to be empty.");
            }
        } catch (mErr: any) {
            throw new Error(`Failed to read .docx file: ${mErr.message}`);
        }
      } else if (file.name.endsWith('.txt') || file.name.endsWith('.doc')) {
        textContent = await file.text();
        if (!textContent.trim()) {
            throw new Error("The uploaded text file is empty.");
        }
      } else {
        throw new Error("Unsupported format. Please upload a .docx, .doc, or .txt file.");
      }

      const parsedData = await parseItineraryFromText(textContent);
      const defaultTheme: ThemeType = 'luxe';
      setState({
        step: 'edit',
        packageData: {
          packageName: parsedData.packageName || 'Motorcycle Tour',
          destination: parsedData.destination || 'The Open Road',
          duration: parsedData.duration || 'Custom Duration',
          currency: parsedData.currency || 'USD',
          soloBikePrice: parsedData.soloBikePrice || '',
          dualRiderPrice: parsedData.dualRiderPrice || '',
          ownBikePrice: parsedData.ownBikePrice || '',
          extraPrice: parsedData.extraPrice || '',
          dualSharingExtra: parsedData.dualSharingExtra || '',
          singleRoomExtra: parsedData.singleRoomExtra || '',
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
      console.error("File processing failed:", err);
      let userFriendlyMessage = err.message;
      if (err instanceof GeminiError) {
          userFriendlyMessage = `AI Processing Error: ${err.message}`;
      } else if (err.name === 'QuotaExceededError') {
          userFriendlyMessage = "Storage quota exceeded on your device. Cannot process large files.";
      }
      setState(prev => ({ ...prev, isLoading: false, error: userFriendlyMessage }));
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
        setState(prev => ({ ...prev, error: "Logo file size must be less than 2MB." }));
        return;
    }

    const reader = new FileReader();
    reader.onerror = () => setState(prev => ({ ...prev, error: "Failed to read the logo image." }));
    reader.onload = (event) => {
      if (event.target?.result) {
        handleFieldChange('logoUrl', event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCoverImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        setState(prev => ({ ...prev, error: "Cover image size must be less than 5MB." }));
        return;
    }

    const reader = new FileReader();
    reader.onerror = () => setState(prev => ({ ...prev, error: "Failed to read the cover image." }));
    reader.onload = (event) => {
      if (event.target?.result) {
        handleFieldChange('coverImageUrl', event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDayImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        setState(prev => ({ ...prev, error: "Day image size must be less than 5MB." }));
        return;
    }

    const reader = new FileReader();
    reader.onerror = () => setState(prev => ({ ...prev, error: "Failed to read the image file." }));
    reader.onload = (event) => {
      if (event.target?.result) {
        // If in preview mode, we stage it for confirmation
        if (state.step === 'preview') {
          setPendingUploadImage(event.target.result as string);
          setActiveUploadIndex(index);
          setActiveRegenIndex(null); // Close regen if open
        } else {
          // In edit mode, update directly for speed
          handleDayChange(index, 'imageUrl', event.target.result as string);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRegenerateImage = async (index: number) => {
    if (!state.packageData) return;
    const day = state.packageData.itinerary[index];
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    await ensureApiKey();

    try {
      const imageUrl = await generateDayImage(
        day.location,
        day.title,
        day.description || day.activities.join('. '),
        regenPrompt
      );
      handleDayChange(index, 'imageUrl', imageUrl);
      setActiveRegenIndex(null);
      setRegenPrompt("");
    } catch (err: any) {
      console.error("Regeneration failed:", err);
      let errMsg = err.message || "Failed to generate image.";
      
      if (err instanceof GeminiError && err.status === 403) {
          errMsg = "API Key Permission Denied. Please ensure your project has billing enabled or the key is valid.";
          window.aistudio?.openSelectKey();
      } else if (err.message?.includes("PERMISSION_DENIED")) {
          errMsg = "API Key error. Please re-select or update your API key.";
          window.aistudio?.openSelectKey();
      }
      
      setState(prev => ({ ...prev, error: errMsg }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleFieldChange = (field: keyof TravelPackage, value: any) => {
    setState(prev => ({
      ...prev,
      packageData: prev.packageData ? { ...prev.packageData, [field]: value } : null
    }));
  };

  const handleStyleChange = (styleField: keyof ThemeStyles, value: any) => {
    if (!state.packageData) return;
    setState(prev => ({
      ...prev,
      packageData: prev.packageData ? {
        ...prev.packageData,
        styles: { ...prev.packageData.styles, [styleField]: value }
      } : null
    }));
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
    
    html2pdf()
      .set(opt)
      .from(element)
      .save()
      .then(() => setState(prev => ({ ...prev, isLoading: false })))
      .catch((err: any) => {
          console.error("PDF generation failed:", err);
          setState(prev => ({ ...prev, isLoading: false, error: "Failed to generate PDF. Large images might be causing an issue." }));
      });
  };

  const downloadFlyerJpeg = async () => {
    if (!flyerRef.current) return;
    setState(prev => ({ ...prev, isLoading: true }));
    try {
        const canvas = await html2canvas(flyerRef.current, { scale: 4, useCORS: true });
        const link = document.createElement('a');
        link.download = `${state.packageData?.packageName || 'Itinerary'}_Flyer.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 1.0);
        link.click();
    } catch (err) {
        console.error("JPEG export failed:", err);
        setState(prev => ({ ...prev, error: "Failed to export JPEG flyer." }));
    } finally {
        setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const themes: { id: ThemeType; name: string }[] = [
    { id: 'luxe', name: 'Classic Luxe' },
    { id: 'vanguard', name: 'Modern Vanguard' },
    { id: 'wanderlust', name: 'Adventurous Wanderlust' }
  ];

  const pricingFields = [
    { key: 'soloBikePrice', label: 'Solo Bike Price' },
    { key: 'dualRiderPrice', label: 'Dual Rider Price' },
    { key: 'ownBikePrice', label: 'Own Bike Price' },
    { key: 'extraPrice', label: 'Extra Price' },
    { key: 'dualSharingExtra', label: 'Dual Sharing Extra Cost' },
    { key: 'singleRoomExtra', label: 'Single Room Extra Cost' },
  ] as const;

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
            <button onClick={() => setState(prev => ({ ...prev, step: 'preview' }))} className="btn-primary flex items-center gap-2 px-8">
              Preview Itinerary
            </button>
          )}
          {state.step === 'preview' && (
            <>
              <div className="flex items-center bg-gray-50 border border-gray-200 rounded-md p-1 mr-2">
                <button 
                  onClick={() => setPdfOrientation('portrait')}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded transition-all ${pdfOrientation === 'portrait' ? 'bg-white shadow-sm text-black' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Portrait
                </button>
                <button 
                  onClick={() => setPdfOrientation('landscape')}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded transition-all ${pdfOrientation === 'landscape' ? 'bg-white shadow-sm text-black' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Landscape
                </button>
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
            <p className="text-xl font-serif italic text-gray-800">Processing...</p>
          </div>
        )}

        {state.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg mb-8 flex justify-between items-center sticky top-24 z-[60] shadow-md animate-in slide-in-from-top-4">
            <span className="text-sm font-medium">{state.error}</span>
            <div className="flex gap-4 items-center">
               <button onClick={async () => await window.aistudio?.openSelectKey()} className="text-[10px] font-black uppercase tracking-widest bg-red-100 hover:bg-red-200 px-3 py-1 rounded">Update API Key</button>
               <button onClick={() => setState(prev => ({ ...prev, error: null }))} className="text-2xl leading-none">&times;</button>
            </div>
          </div>
        )}

        {state.step === 'upload' && (
          <div className="flex flex-col items-center justify-center py-20 luxury-card p-16 text-center max-w-2xl mx-auto border-2 border-dashed border-gray-200 hover:border-black transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-10 border shadow-inner">
               <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
            </div>
            <h2 className="text-4xl font-serif mb-6">Upload Doc File</h2>
            <p className="text-gray-500 mb-10 text-lg leading-relaxed max-w-md mx-auto">
              Select your motorcycle tour document. We will automatically extract the day-wise pointers and structure.
            </p>
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
                  <div className="group relative flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-xl p-6 bg-gray-50/50 hover:bg-gray-100 transition-all cursor-pointer overflow-hidden" onClick={() => logoInputRef.current?.click()}>
                    {state.packageData.logoUrl ? (
                      <img src={state.packageData.logoUrl} alt="Logo" className="max-h-24 object-contain" />
                    ) : (
                      <span className="text-xs text-gray-400 font-black uppercase tracking-widest">Company Logo</span>
                    )}
                    <input type="file" ref={logoInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
                  </div>
                  <input className="w-full p-3 border border-gray-100 rounded-lg outline-none font-serif text-lg" placeholder="Agency Name" value={state.packageData.companyName || ''} onChange={e => handleFieldChange('companyName', e.target.value)} />
                </div>
              </section>

              <section className="luxury-card p-8">
                <h3 className="text-xl font-serif font-bold mb-6 border-b pb-4">Theme & Style</h3>
                <div className="space-y-8">
                  <div className="grid grid-cols-1 gap-3">
                    {themes.map(t => (
                      <button key={t.id} onClick={() => handleThemeChange(t.id)} className={`text-left px-5 py-3 rounded-lg border transition-all ${state.packageData?.theme === t.id ? 'bg-black text-white' : 'bg-white text-gray-600'}`}>
                        <span className="text-sm font-medium">{t.name}</span>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-4 border-t pt-6">
                     <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Colors</h4>
                     <div className="grid grid-cols-1 gap-4">
                        <div className="flex items-center justify-between">
                           <span className="text-xs text-gray-500">Primary</span>
                           <input type="color" className="w-8 h-8 rounded cursor-pointer border-none p-0" value={state.packageData.styles.primaryColor} onChange={(e) => handleStyleChange('primaryColor', e.target.value)} />
                        </div>
                        <div className="flex items-center justify-between">
                           <span className="text-xs text-gray-500">Accent</span>
                           <input type="color" className="w-8 h-8 rounded cursor-pointer border-none p-0" value={state.packageData.styles.accentColor} onChange={(e) => handleStyleChange('accentColor', e.target.value)} />
                        </div>
                        <div className="flex items-center justify-between">
                           <span className="text-xs text-gray-500">Background</span>
                           <input type="color" className="w-8 h-8 rounded cursor-pointer border-none p-0" value={state.packageData.styles.backgroundColor} onChange={(e) => handleStyleChange('backgroundColor', e.target.value)} />
                        </div>
                     </div>
                  </div>

                  <div className="space-y-6 border-t pt-6">
                     <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Typography</h4>
                     
                     <div className="space-y-6">
                        {/* Heading Fonts */}
                        <div className="space-y-4 bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                          <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest">Headings Style</label>
                          <div className="space-y-3">
                            <select 
                              className="w-full p-2 border border-gray-100 rounded text-xs outline-none bg-white" 
                              value={state.packageData.styles.headingFont} 
                              onChange={(e) => handleStyleChange('headingFont', e.target.value)}
                            >
                              {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
                            </select>
                            <div className="flex gap-2">
                              <select 
                                className="flex-1 p-2 border border-gray-100 rounded text-xs outline-none bg-white" 
                                value={state.packageData.styles.headingWeight} 
                                onChange={(e) => handleStyleChange('headingWeight', e.target.value)}
                              >
                                {WEIGHT_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.name}</option>)}
                              </select>
                              <button 
                                onClick={() => handleStyleChange('headingStyle', state.packageData?.styles.headingStyle === 'italic' ? 'normal' : 'italic')}
                                className={`px-4 py-2 rounded border text-xs font-serif italic transition-all ${state.packageData.styles.headingStyle === 'italic' ? 'bg-black text-white' : 'bg-white text-gray-400 border-gray-100'}`}
                              >
                                I
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Body Fonts */}
                        <div className="space-y-4 bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                          <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest">Body Text Style</label>
                          <div className="space-y-3">
                            <select 
                              className="w-full p-2 border border-gray-100 rounded text-xs outline-none bg-white" 
                              value={state.packageData.styles.bodyFont} 
                              onChange={(e) => handleStyleChange('bodyFont', e.target.value)}
                            >
                              {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
                            </select>
                            <div className="flex gap-2">
                              <select 
                                className="flex-1 p-2 border border-gray-100 rounded text-xs outline-none bg-white" 
                                value={state.packageData.styles.bodyWeight} 
                                onChange={(e) => handleStyleChange('bodyWeight', e.target.value)}
                              >
                                {WEIGHT_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.name}</option>)}
                              </select>
                              <button 
                                onClick={() => handleStyleChange('bodyStyle', state.packageData?.styles.bodyStyle === 'italic' ? 'normal' : 'italic')}
                                className={`px-4 py-2 rounded border text-xs font-serif italic transition-all ${state.packageData.styles.bodyStyle === 'italic' ? 'bg-black text-white' : 'bg-white text-gray-400 border-gray-100'}`}
                              >
                                I
                              </button>
                            </div>
                          </div>
                        </div>
                     </div>
                  </div>
                </div>
              </section>

              <section className="luxury-card p-8">
                <h3 className="text-xl font-serif font-bold mb-6 border-b pb-4">Pricing ({state.packageData.currency})</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Currency</label>
                    <input className="w-full p-2 border border-gray-100 rounded-lg outline-none text-sm font-bold" value={state.packageData.currency} onChange={e => handleFieldChange('currency', e.target.value)} />
                  </div>
                  {pricingFields.map(field => (
                    <div key={field.key}>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{field.label}</label>
                      <input 
                        className="w-full p-2 border border-gray-100 rounded-lg outline-none text-sm" 
                        placeholder="Price amount" 
                        value={(state.packageData as any)[field.key] || ''} 
                        onChange={e => handleFieldChange(field.key as any, e.target.value)} 
                      />
                    </div>
                  ))}
                </div>
              </section>
            </aside>

            <section className="lg:col-span-8 space-y-8">
               <h3 className="text-3xl font-serif font-bold mb-4">Itinerary Details</h3>
               {state.packageData.itinerary.map((day, idx) => (
                 <div key={idx} className="luxury-card p-10 space-y-6 relative group border-l-4 border-transparent hover:border-black transition-all">
                   <div className="absolute top-6 right-6 text-6xl font-serif opacity-5 select-none pointer-events-none">0{day.day}</div>
                   
                   <div className="space-y-4">
                      <input className="w-full text-2xl font-serif font-bold border-b border-transparent focus:border-gray-200 outline-none pb-2 bg-transparent" value={day.title} onChange={e => handleDayChange(idx, 'title', e.target.value)} />
                      <input className="w-full p-3 border border-gray-50 rounded-lg outline-none focus:bg-white bg-zinc-50/50" value={day.location} onChange={e => handleDayChange(idx, 'location', e.target.value)} />
                   </div>

                   <div className="space-y-3">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Day Pointers (Activities)</label>
                      {day.activities.map((act, actIdx) => (
                        <div key={actIdx} className="flex gap-2 group/act">
                           <input 
                              className="flex-1 p-2 border border-gray-50 rounded-lg outline-none text-sm bg-zinc-50/30 focus:bg-white" 
                              value={act} 
                              onChange={e => updateDayActivity(idx, actIdx, e.target.value)} 
                           />
                           <button onClick={() => removeDayActivity(idx, actIdx)} className="opacity-0 group-hover/act:opacity-100 text-red-300 hover:text-red-500 transition-opacity">&times;</button>
                        </div>
                      ))}
                      <button onClick={() => addDayActivity(idx)} className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-black transition-colors">+ Add Pointer</button>
                   </div>
                   
                   <div className="pt-6 border-t border-gray-50 flex flex-col gap-4">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Day Visual</label>
                      <div className="flex items-center gap-6">
                        <div className="w-48 aspect-video bg-gray-50 rounded-lg overflow-hidden border flex items-center justify-center relative group">
                           {day.imageUrl ? (
                             <>
                               <img src={day.imageUrl} className="w-full h-full object-cover" alt="Day preview" />
                               <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <label className="cursor-pointer text-white text-[10px] font-bold uppercase p-2 border border-white/40 rounded">
                                    Change Image
                                    <input type="file" accept="image/*" className="hidden" onChange={e => handleDayImageUpload(idx, e)} />
                                  </label>
                               </div>
                             </>
                           ) : (
                             <label className="cursor-pointer text-[10px] text-gray-300 hover:text-black flex flex-col items-center gap-2">
                               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                               Upload
                               <input type="file" accept="image/*" className="hidden" onChange={e => handleDayImageUpload(idx, e)} />
                             </label>
                           )}
                        </div>
                      </div>
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
              {/* Dynamic Theme Styles Injection */}
              <style dangerouslySetInnerHTML={{ __html: `
                .itinerary-pdf-container h1, 
                .itinerary-pdf-container h2, 
                .itinerary-pdf-container h3, 
                .itinerary-pdf-container h4,
                .itinerary-pdf-container .heading-font {
                  font-family: ${state.packageData.styles.headingFont};
                  font-weight: ${state.packageData.styles.headingWeight};
                  font-style: ${state.packageData.styles.headingStyle};
                  color: ${state.packageData.styles.primaryColor};
                }
                .itinerary-pdf-container .accent-color {
                  color: ${state.packageData.styles.accentColor};
                }
                .itinerary-pdf-container .accent-bg {
                  background-color: ${state.packageData.styles.accentColor};
                }
                .itinerary-pdf-container .day-number {
                  color: ${state.packageData.styles.primaryColor};
                  opacity: 0.05;
                }
                .itinerary-pdf-container li::before {
                  color: ${state.packageData.styles.accentColor};
                }
              `}} />

              {/* FLYER / COVER */}
              <div ref={flyerRef} className="relative -mx-[20mm] -mt-[20mm] mb-12 flex flex-col overflow-hidden group/cover" style={{height: pdfOrientation === 'landscape' ? '210mm' : '297mm'}}>
                {state.packageData.coverImageUrl || state.packageData.itinerary[0]?.imageUrl ? (
                  <img src={state.packageData.coverImageUrl || state.packageData.itinerary[0]?.imageUrl} className="absolute inset-0 w-full h-full object-cover" alt="Cover" />
                ) : (
                  <div className="absolute inset-0 bg-zinc-900"></div>
                )}
                
                <div className="no-print absolute inset-0 bg-black/40 opacity-0 group-hover/cover:opacity-100 transition-opacity flex flex-col items-center justify-center z-20">
                    <label className="px-8 py-4 bg-white text-black text-[10px] font-black uppercase rounded tracking-[0.3em] cursor-pointer shadow-2xl hover:scale-105 transition-transform">
                      Upload Custom Cover
                      <input type="file" accept="image/*" className="hidden" onChange={handleCoverImageUpload} />
                    </label>
                </div>

                <div className={`absolute inset-0 bg-black/40`}></div>
                <div className="relative z-10 p-24 h-full flex flex-col text-white">
                  <div className="flex justify-between items-start">
                    {state.packageData.logoUrl ? <img src={state.packageData.logoUrl} className="h-16 object-contain brightness-0 invert" alt="Logo" /> : <div className="w-12 h-12 border-2 rounded-full border-white/20" />}
                    <span className="text-sm font-black uppercase tracking-[0.4em]">{state.packageData.companyName}</span>
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
                <p className="text-xl leading-relaxed font-light opacity-80">Welcome to a road-trip redefined. We've captured the essence of the path ahead in these curated pointers, ensuring every day is a milestone of adventure.</p>
              </div>

              {/* ITINERARY FLOW */}
              <div className="py-20 space-y-64 px-10">
                {state.packageData.itinerary.map((day, idx) => (
                  <div key={idx} id={`day-${idx}`} className="space-y-12 relative">
                    <div className="flex items-center gap-10">
                       <span className="text-9xl tracking-tighter leading-none day-number font-black absolute -left-12 -top-12">0{day.day}</span>
                       <div className="relative z-10">
                          <span className="text-xs font-black uppercase tracking-widest opacity-40">Day 0{day.day}</span>
                          <h3 className="text-6xl tracking-tight leading-none">{day.title}</h3>
                       </div>
                    </div>
                    
                    <div className="relative group/img aspect-[16/9] overflow-hidden rounded-sm shadow-2xl bg-zinc-50">
                      {day.imageUrl ? (
                        <img src={day.imageUrl} className="w-full h-full object-cover" alt={day.title} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-200">
                           <span className="text-sm uppercase tracking-widest">No Image Selected</span>
                        </div>
                      )}
                      
                      <div className="no-print absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex flex-col items-center justify-center p-8 text-white text-center z-20">
                        {activeRegenIndex === idx ? (
                          <div className="w-full max-w-sm space-y-4 animate-in fade-in zoom-in-95">
                            <h4 className="text-xs font-black uppercase tracking-[0.2em] mb-2 text-white">AI Regeneration Prompt</h4>
                            <textarea 
                              className="w-full bg-white/10 border border-white/20 rounded p-3 text-sm focus:outline-none focus:bg-white/20 h-24 resize-none text-white"
                              placeholder="Describe the new image based on these pointers..."
                              value={regenPrompt}
                              onChange={(e) => setRegenPrompt(e.target.value)}
                            />
                            <div className="flex gap-2">
                               <button onClick={() => handleRegenerateImage(idx)} className="flex-1 bg-white text-black text-[10px] font-black uppercase py-3 rounded tracking-widest">Generate</button>
                               <button onClick={() => { setActiveRegenIndex(null); setRegenPrompt(""); }} className="px-4 py-3 border border-white/20 text-[10px] uppercase font-black tracking-widest rounded hover:bg-white/10">Cancel</button>
                            </div>
                          </div>
                        ) : activeUploadIndex === idx && pendingUploadImage ? (
                          <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-4 bg-black/90 p-8 rounded-xl border border-white/10 shadow-2xl backdrop-blur-md">
                             <h4 className="text-sm font-black uppercase tracking-[0.2em] text-white">Confirm New Image?</h4>
                             <div className="w-full aspect-video rounded border border-white/20 overflow-hidden shadow-2xl">
                                <img src={pendingUploadImage} className="w-full h-full object-cover" alt="New pending upload" />
                             </div>
                             <div className="flex gap-3">
                                <button 
                                  onClick={() => {
                                    handleDayChange(idx, 'imageUrl', pendingUploadImage);
                                    setActiveUploadIndex(null);
                                    setPendingUploadImage(null);
                                  }} 
                                  className="flex-1 bg-green-500 hover:bg-green-600 text-white text-[10px] font-black uppercase py-4 rounded tracking-widest transition-all shadow-lg"
                                >
                                  Confirm & Replace
                                </button>
                                <button 
                                  onClick={() => { setActiveUploadIndex(null); setPendingUploadImage(null); }} 
                                  className="px-6 py-4 border border-white/20 text-[10px] uppercase font-black tracking-widest rounded hover:bg-white/10 text-white/70 hover:text-white"
                                >
                                  Cancel
                                </button>
                             </div>
                          </div>
                        ) : (
                          <div className="flex gap-4">
                            <button onClick={() => { setActiveRegenIndex(idx); setActiveUploadIndex(null); }} className="px-6 py-3 bg-white text-black text-[10px] font-black uppercase rounded tracking-widest shadow-xl hover:scale-105 transition-transform">Regenerate (AI)</button>
                            <label className="px-6 py-3 border border-white text-white text-[10px] font-black uppercase rounded tracking-widest cursor-pointer hover:bg-white/10 transition-colors">
                              Upload File
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleDayImageUpload(idx, e)} />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 opacity-40">
                      <div className="w-4 h-px accent-bg" />
                      <span className="text-[10px] uppercase tracking-[0.3em] font-black">{day.location}</span>
                    </div>

                    {/* POINTERS LIST */}
                    <div className="space-y-6">
                       <ul className="space-y-4">
                          {day.activities.map((act, actI) => (
                            <li key={actI} className="flex gap-6 items-start">
                               <span className="text-xl font-light opacity-30 mt-[-4px] accent-color">•</span>
                               <span className="text-lg leading-relaxed">{act}</span>
                            </li>
                          ))}
                       </ul>
                    </div>
                  </div>
                ))}
              </div>

              {/* PRICING TABLE SECTION */}
              <div className="mt-40 py-24 -mx-[20mm] px-[30mm] border-t border-zinc-100/20" style={{backgroundColor: 'rgba(0,0,0,0.02)'}}>
                 <h3 className="text-4xl mb-16 pb-4 border-b" style={{borderColor: state.packageData.styles.primaryColor}}>Package Investment</h3>
                 <div className="grid grid-cols-2 gap-20">
                    <div className="space-y-8">
                       {[
                         {label: 'Solo Bike Price', value: state.packageData.soloBikePrice},
                         {label: 'Dual Rider Price', value: state.packageData.dualRiderPrice},
                         {label: 'Own Bike Price', value: state.packageData.ownBikePrice},
                       ].map(row => (
                        <div key={row.label} className="flex justify-between items-baseline border-b border-zinc-200/20 pb-2">
                          <span className="font-black text-[10px] uppercase tracking-widest opacity-40">{row.label}</span>
                          <span className="text-2xl font-light">{state.packageData.currency} {row.value || '-'}</span>
                        </div>
                       ))}
                    </div>
                    <div className="space-y-8">
                       {[
                         {label: 'Extra Prices', value: state.packageData.extraPrice},
                         {label: 'Dual Sharing Extra', value: state.packageData.dualSharingExtra},
                         {label: 'Single Room Extra', value: state.packageData.singleRoomExtra},
                       ].map(row => (
                        <div key={row.label} className="flex justify-between items-baseline border-b border-zinc-200/20 pb-2">
                          <span className="font-black text-[10px] uppercase tracking-widest opacity-40">{row.label}</span>
                          <span className="text-2xl font-light">{state.packageData.currency} {row.value || '-'}</span>
                        </div>
                       ))}
                    </div>
                 </div>
              </div>

              {/* LOGISTICS */}
              <div className="py-24 px-10 grid grid-cols-2 gap-24">
                <div>
                  <h4 className="text-[10px] uppercase tracking-widest font-black mb-10 opacity-30 border-b pb-2" style={{borderColor: state.packageData.styles.primaryColor}}>Inclusions</h4>
                  <ul className="space-y-4">
                    {state.packageData.inclusions.map((item, i) => (
                      <li key={i} className="flex gap-4 items-start text-sm font-light">
                        <span className="opacity-20">/</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-[10px] uppercase tracking-widest font-black mb-10 opacity-30 border-b pb-2" style={{borderColor: state.packageData.styles.primaryColor}}>Exclusions</h4>
                  <ul className="space-y-4">
                    {state.packageData.exclusions.map((item, i) => (
                      <li key={i} className="flex gap-4 items-start text-sm font-light opacity-60">
                        <span className="opacity-20">×</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* FOOTER */}
              <div className="py-20 text-center border-t border-gray-100/20 mt-20">
                 <p className="text-3xl italic mb-4 heading-font">{state.packageData.companyName || 'Adventure Co.'}</p>
                 <p className="text-[8px] uppercase tracking-[0.5em] opacity-30 font-black">Bespoke Journeys • Registered Travel Provider • © 2025</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
