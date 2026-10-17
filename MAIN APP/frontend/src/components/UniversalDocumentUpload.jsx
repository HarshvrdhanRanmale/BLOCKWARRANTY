import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import heic2any from 'heic2any';

const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif', '.bmp', '.tif', '.tiff', '.pdf'];
const ACCEPTED_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'application/pdf',
];
const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',') + ',' + ACCEPTED_MIMES.join(',');

export default function UniversalDocumentUpload({
  file,
  preview,
  onFileSelect,
  onRemove,
  onExtract,
  extracting = false,
  extractionError = '',
  extractionSuccess = false,
  label = 'Upload invoice or document',
  description = 'Drag & drop, browse, or paste an image (Ctrl+V). AI will extract the key details.',
  maxSizeMB = 15,
  isService = false,
  showExtractButton = true,
  onContinueManually = null,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [convertingHeic, setConvertingHeic] = useState(false);
  const [localError, setLocalError] = useState('');
  const [pasteActive, setPasteActive] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [localBlobUrl, setLocalBlobUrl] = useState('');
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    setImageError(false);
    if (file instanceof Blob && (file.type?.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(file.name || ''))) {
      const url = URL.createObjectURL(file);
      setLocalBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setLocalBlobUrl('');
    }
  }, [file]);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const validateAndProcessFile = useCallback(
    async (rawFile) => {
      setLocalError('');
      if (!rawFile) return;

      const extension = '.' + (rawFile.name.split('.').pop() || '').toLowerCase();
      const mime = (rawFile.type || '').toLowerCase();

      const isExtensionAccepted = ACCEPTED_EXTENSIONS.includes(extension);
      const isMimeAccepted = ACCEPTED_MIMES.includes(mime) || mime.startsWith('image/');

      if (!isExtensionAccepted && !isMimeAccepted) {
        setLocalError(
          `Unsupported file format (${rawFile.name}). Supported: JPG, PNG, WebP, HEIC, HEIF, PDF.`
        );
        return;
      }

      if (rawFile.size > maxSizeBytes) {
        setLocalError(
          `File size is ${(rawFile.size / (1024 * 1024)).toFixed(1)} MB. Maximum allowed size is ${maxSizeMB} MB.`
        );
        return;
      }

      const isHeic =
        extension === '.heic' ||
        extension === '.heif' ||
        mime === 'image/heic' ||
        mime === 'image/heif';

      if (isHeic) {
        setConvertingHeic(true);
        try {
          const convertedBlob = await heic2any({
            blob: rawFile,
            toType: 'image/jpeg',
            quality: 0.92,
          });
          const singleBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
          const convertedFile = new File(
            [singleBlob],
            rawFile.name.replace(/\.(heic|heif)$/i, '.jpg'),
            { type: 'image/jpeg' }
          );

          const previewUrl = URL.createObjectURL(singleBlob);
          onFileSelect(convertedFile, previewUrl, rawFile);
        } catch (convErr) {
          console.warn('In-browser HEIC conversion fallback:', convErr.message);
          // If browser conversion fails, pass the raw HEIC file for backend conversion
          onFileSelect(rawFile, '', rawFile);
        } finally {
          setConvertingHeic(false);
        }
        return;
      }

      if (mime === 'application/pdf' || extension === '.pdf') {
        onFileSelect(rawFile, '', rawFile);
        return;
      }

      // Standard images (JPEG, PNG, WebP)
      try {
        const objectUrl = URL.createObjectURL(rawFile);
        onFileSelect(rawFile, objectUrl, rawFile);
      } catch {
        const reader = new FileReader();
        reader.onload = () => {
          onFileSelect(rawFile, reader.result, rawFile);
        };
        reader.onerror = () => {
          setLocalError('Could not read the selected file. Please try again.');
        };
        reader.readAsDataURL(rawFile);
      }
    },
    [maxSizeBytes, maxSizeMB, onFileSelect]
  );

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current?.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      validateAndProcessFile(e.dataTransfer.files[0]);
    }
  };

  // Clipboard paste listener
  useEffect(() => {
    const handlePaste = (e) => {
      // Do not intercept pastes into input or textarea elements
      const targetTag = (e.target?.tagName || '').toUpperCase();
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || e.target?.isContentEditable) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1 || item.kind === 'file') {
          const pastedFile = item.getAsFile();
          if (pastedFile) {
            e.preventDefault();
            setPasteActive(true);
            setTimeout(() => setPasteActive(false), 1500);
            validateAndProcessFile(pastedFile);
            return;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [validateAndProcessFile]);

  const isPdf =
    file?.type === 'application/pdf' ||
    file?.name?.toLowerCase().endsWith('.pdf');

  return (
    <div
      ref={containerRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative overflow-hidden rounded-2xl border transition-all duration-200 ${
        isDragOver
          ? 'border-blue-500 bg-blue-50/70 shadow-lg ring-4 ring-blue-100'
          : 'border-slate-200 bg-white shadow-sm hover:border-slate-300'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        onChange={(e) => {
          if (e.target.files?.[0]) {
            validateAndProcessFile(e.target.files[0]);
            e.target.value = '';
          }
        }}
        className="sr-only"
        id="universal-document-input"
        aria-label={label}
      />

      {!file ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className="group flex min-h-[260px] cursor-pointer flex-col items-center justify-center p-6 text-center sm:p-8"
        >
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-2xl transition duration-200 ${
              isDragOver
                ? 'scale-110 bg-blue-600 text-white shadow-md'
                : 'bg-blue-50 text-blue-600 group-hover:scale-105 group-hover:bg-blue-100'
            }`}
          >
            {convertingHeic ? (
              <LoaderCircle size={28} className="animate-spin" />
            ) : (
              <Upload size={28} />
            )}
          </div>

          <h3 className="mt-4 text-base font-bold text-slate-900 sm:text-lg">
            {convertingHeic ? 'Preparing image…' : label}
          </h3>

          <p className="mt-1.5 max-w-md text-xs leading-5 text-slate-500 sm:text-sm">
            {description}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700">
              <Upload size={14} /> Choose File
            </span>
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              or drop here
            </span>
            <span className="hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 sm:inline">
              Ctrl+V to paste
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
            <span>JPG, PNG, WebP, HEIC/HEIF, PDF</span>
            <span>•</span>
            <span>Max {maxSizeMB} MB</span>
          </div>

          {pasteActive && (
            <div className="mt-3 rounded-md bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800 animate-pulse">
              Pasted from clipboard!
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* Document Preview Thumbnail */}
            <div className="flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:h-28 sm:w-28">
              {!imageError && (preview || localBlobUrl) ? (
                <img
                  src={preview || localBlobUrl}
                  alt="Document preview"
                  onError={() => setImageError(true)}
                  className="h-full w-full object-contain p-1"
                />
              ) : isPdf ? (
                <div className="flex flex-col items-center justify-center text-red-600">
                  <FileText size={36} />
                  <span className="mt-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    PDF File
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400">
                  <ImageIcon size={32} />
                  <span className="mt-1 text-[10px] font-bold text-slate-500">
                    {file?.name?.split('.').pop()?.toUpperCase() || 'Document'}
                  </span>
                </div>
              )}
            </div>

            {/* Document Information and Status */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900" title={file.name}>
                    {file.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || 'Document'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={extracting}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={onRemove}
                    disabled={extracting}
                    aria-label="Remove uploaded document"
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                </div>
              </div>

              {/* Extraction Status / Actions */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {extracting ? (
                  <div className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">
                    <LoaderCircle size={14} className="animate-spin text-blue-600" />
                    <span>Extracting details with AI…</span>
                  </div>
                ) : extractionSuccess ? (
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>AI extraction complete • Review fields below</span>
                  </div>
                ) : showExtractButton && onExtract ? (
                  <button
                    type="button"
                    onClick={onExtract}
                    disabled={extracting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    <RefreshCw size={13} /> Run AI Extraction
                  </button>
                ) : null}

                {onContinueManually && !extractionSuccess && (
                  <button
                    type="button"
                    onClick={onContinueManually}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                  >
                    Enter details manually
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Validation or Extraction Error Banner */}
      {(localError || extractionError) && (
        <div
          role="alert"
          className="flex items-start gap-2.5 border-t border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-900"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-600" />
          <div className="flex-1">
            <p className="font-semibold">{localError || extractionError}</p>
            {onExtract && file && (
              <button
                type="button"
                onClick={onExtract}
                disabled={extracting}
                className="mt-1 font-bold text-rose-700 underline hover:text-rose-900"
              >
                Retry AI extraction
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
