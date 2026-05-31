import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, FileText, CheckCircle2, Sparkles, Download, 
  ChevronRight, RefreshCw, FileCheck2, FileSignature
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import mammoth from 'mammoth';
import { marked } from 'marked';
import html2pdf from 'html2pdf.js';
import './App.css';

// Set up PDF.js worker using Vite's ?url import
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function App() {
  const [step, setStep] = useState(1); // 1: Upload, 2: Process, 3: Results
  const [file, setFile] = useState(null);
  const [rawText, setRawText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  
  // Results state
  const [optimizedCv, setOptimizedCv] = useState(null);
  const [coverLetter, setCoverLetter] = useState(null);
  const [activeTab, setActiveTab] = useState('cv'); // 'cv' or 'coverLetter'

  // Ref for file input
  const fileInputRef = useRef(null);

  const processDocument = async () => {
    setStep(2);
    
    let textToProcess = rawText;
    let extractionError = null;

    // Try parsing files locally to extract raw text
    if (file) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        
        const isTxt = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt');
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                       file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc');

        if (isTxt) {
          textToProcess = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsText(file);
          });
        } else if (isPdf) {
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          let text = '';
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const strings = content.items.map(item => item.str);
            text += strings.join(' ') + '\n';
          }
          textToProcess = text;
        } else if (isDocx) {
          const result = await mammoth.extractRawText({ arrayBuffer });
          textToProcess = result.value;
        } else {
          extractionError = "Unsupported file type or extension not recognized.";
        }
      } catch (err) {
        console.error("Error extracting file text:", err);
        extractionError = err.message;
      }
    }

    if (!textToProcess || textToProcess.trim() === '') {
       alert("Could not extract text from the document. " + (extractionError || "Please try pasting the raw text instead."));
       setStep(1);
       return;
    }

    // Call OpenAI API to structure the CV
    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      if (!apiKey) {
         throw new Error("OpenAI API key is missing. Please add it to your .env file.");
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini", // Fast and capable model
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are an expert Canadian ATS CV Optimizer. You receive messy, unstructured text extracted from a CV. 
Your task is to analyze it, extract the candidate's core details, and rewrite the CV to perfectly match Canadian ATS standards.
Rules:
- Remove all personal/discriminatory information (photo, age, marital status, religion).
- TRANSLATE AND WRITE EVERYTHING IN FRENCH. The entire output MUST be in French.
- Use ONLY French headings: "Résumé Exécutif", "Expérience Professionnelle", "Éducation", "Compétences", "Langues". DO NOT use English headings like "Executive Summary" or "Professional Experience".
- Ensure bullet points are clear, action-oriented, and formatted properly in Markdown.
- Add a "Résumé Exécutif" at the top based on their experience.
- Generate a highly professional, well-structured but generic Canadian cover letter. Focus on the candidate's core strengths, adaptability, and readiness to contribute, without referencing any specific company or hiring manager, so it can be reused easily for multiple applications. Format the cover letter in Markdown: put the candidate's name as a # Heading 1 at the top, followed by contact info, a general greeting (e.g., "Madame, Monsieur,"), and beautifully spaced body paragraphs. IMPORTANT: DO NOT include any date placeholder, and DO NOT include any recipient/company address block (e.g., no "À l'attention de", no company name or address placeholders).
- IMPORTANT: The entire generated content, including all headings, body text, bullet points, and the cover letter, MUST be entirely in French (Français), regardless of the language of the original text.

You MUST respond with a JSON object exactly matching this schema:
{
  "score": number (0-100 representing how highly optimized the output is for ATS),
  "improvements": [string, string, string, string] (List 4-5 key improvements you made to align with Canadian standards, written in French),
  "optimized_content": string (The FULL optimized CV formatted beautifully in Markdown. Put the candidate's name as a # Heading 1 at the top, followed by contact info, written entirely in French),
  "cover_letter": string (The FULL professional cover letter formatted beautifully in Markdown, including the # Heading 1 for the name at the top, written entirely in French)
}`
            },
            {
              role: "user",
              content: textToProcess
            }
          ]
        })
      });

      if (!response.ok) {
         const err = await response.json();
         throw new Error(err.error?.message || "Failed to process via OpenAI API");
      }

      const data = await response.json();
      const result = JSON.parse(data.choices[0].message.content);

      setOptimizedCv({
        score: result.score || 95,
        improvements: result.improvements || [],
        content: result.optimized_content || "*Failed to generate content*"
      });

      setCoverLetter(result.cover_letter || "*Failed to generate cover letter*");
      setStep(3);

    } catch (err) {
      console.error(err);
      alert("Error optimizing CV via AI: " + err.message);
      setStep(1);
    }
  };

  // --- Handlers ---
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const reset = () => {
    setStep(1);
    setFile(null);
    setRawText('');
    setOptimizedCv(null);
    setCoverLetter(null);
    setActiveTab('cv');
  };

  const downloadPdf = (type) => {
    const previewContainer = document.querySelector('.document-preview');
    if (!previewContainer) return;

    // Temporarily remove scroll limits so html2canvas captures the FULL document
    const originalMaxHeight = previewContainer.style.maxHeight;
    const originalOverflow = previewContainer.style.overflow;
    
    previewContainer.style.maxHeight = 'none';
    previewContainer.style.overflow = 'visible';

    const filename = type === 'cv' ? 'Optimized_CV.pdf' : 'Cover_Letter.pdf';

    const opt = {
      margin:       [15, 15, 15, 15],
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, scrollY: 0 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Give the DOM a tiny moment to expand before capturing
    setTimeout(() => {
      html2pdf().set(opt).from(previewContainer).save().then(() => {
        // Restore the scrollable view after download completes
        previewContainer.style.maxHeight = originalMaxHeight || '';
        previewContainer.style.overflow = originalOverflow || '';
      });
    }, 100);
  };

  // --- Render Helpers ---
  const renderStepper = () => (
    <div className="stepper">
      {[
        { num: 1, label: 'Upload CV', icon: Upload },
        { num: 2, label: 'Optimizing', icon: RefreshCw },
        { num: 3, label: 'Results', icon: CheckCircle2 }
      ].map((s) => {
        const Icon = s.icon;
        let className = "step";
        if (step === s.num) className += " active";
        if (step > s.num) className += " completed";
        
        return (
          <div key={s.num} className={className}>
            <div className="step-indicator">
              {step > s.num ? <CheckCircle2 size={20} /> : s.num}
            </div>
            <span className="step-label">{s.label}</span>
          </div>
        );
      })}
    </div>
  );

  const renderUploadStep = () => (
    <div className="glass-panel slide-up">
      <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        Optimize Your CV for the <span className="text-gradient">Canadian Market</span>
      </h2>
      <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '2rem' }}>
        Our AI restructures your resume to meet Canadian ATS standards, ensuring keywords, formatting, and cultural nuances are perfectly aligned.
      </p>

      <div 
        className={`upload-zone ${isDragging ? 'drag-active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="upload-icon" />
        <h3>{file ? file.name : "Drag & Drop your CV here"}</h3>
        <p style={{ color: 'var(--text-muted)' }}>
          {file ? "Click to change file" : "Supports PDF, DOCX, or TXT"}
        </p>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileSelect}
          accept=".pdf,.doc,.docx,.txt"
        />
      </div>

      <div style={{ textAlign: 'center', margin: '2rem 0', color: 'var(--text-muted)' }}>
        — OR —
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <textarea 
          className="input-field" 
          rows="5" 
          placeholder="Paste your raw CV text here..."
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        ></textarea>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          className="btn btn-primary" 
          disabled={!file && !rawText.trim()}
          onClick={processDocument}
        >
          Optimize CV <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );

  const renderProcessingStep = () => (
    <div className="glass-panel processing-container slide-up">
      <div className="loader"></div>
      <h2 style={{ marginBottom: '1rem' }}>Restructuring for ATS Compatibility...</h2>
      <p className="status-text">
        Applying Canadian formatting standards, standardizing headings, and generating your custom cover letter.
      </p>
    </div>
  );

  const renderResultsStep = () => (
    <div className="slide-up">
      <div className="glass-panel" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ marginBottom: '0.5rem' }}>Optimization <span className="text-gradient">Complete</span></h2>
            <p style={{ color: 'var(--text-muted)' }}>Your documents are ready for the Canadian job market.</p>
          </div>
          <button className="btn btn-secondary" onClick={reset}>
            <RefreshCw size={18} /> Start Over
          </button>
        </div>
      </div>

      <div className="results-grid">
        {/* Left Column: ATS Stats & Improvements */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="glass-panel">
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileCheck2 className="logo-icon" /> ATS Score
            </h3>
            <div className="ats-score">
              <div className="score-circle">
                <span className="score-value">{optimizedCv.score}</span>
              </div>
              <div>
                <strong style={{ display: 'block', color: 'var(--success)' }}>Excellent Match</strong>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Highly optimized for parsing.</span>
              </div>
            </div>
            
            <h4 style={{ marginBottom: '1rem' }}>Key Improvements Made:</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {optimizedCv.improvements.map((imp, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <Sparkles size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '0.1rem' }} />
                  <span>{imp}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel">
            <h3 style={{ marginBottom: '1rem' }}>Download Files</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Download your optimized documents in ATS-friendly PDF format.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => downloadPdf('cv')}>
                <Download size={18} /> Download CV (PDF)
              </button>
              <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => downloadPdf('coverLetter')}>
                <Download size={18} /> Download Cover Letter (PDF)
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Document Preview */}
        <div className="glass-panel result-card">
          <div className="tabs">
            <div 
              className={`tab ${activeTab === 'cv' ? 'active' : ''}`}
              onClick={() => setActiveTab('cv')}
            >
              <FileText size={16} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
              Optimized CV
            </div>
            <div 
              className={`tab ${activeTab === 'coverLetter' ? 'active' : ''}`}
              onClick={() => setActiveTab('coverLetter')}
            >
              <FileSignature size={16} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
              Cover Letter
            </div>
          </div>

          <div className="document-preview">
            {activeTab === 'cv' ? (
              <div dangerouslySetInnerHTML={{ __html: marked.parse(optimizedCv.content) }} />
            ) : (
              <div dangerouslySetInnerHTML={{ __html: marked.parse(coverLetter) }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">
          <FileCheck2 className="logo-icon" size={32} />
          <span>CV<span style={{ color: 'var(--primary-light)' }}>Optimiser</span></span>
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Canadian ATS Compliance Tool
        </div>
      </header>

      <main>
        {renderStepper()}

        {step === 1 && renderUploadStep()}
        {step === 2 && renderProcessingStep()}
        {step === 3 && renderResultsStep()}
      </main>
    </div>
  );
}

export default App;
