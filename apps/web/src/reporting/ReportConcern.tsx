/* Codex-owned reporting workflow integration. Claude may polish presentation
 * and accessibility, but the request shape, claim-safe wording, and artifact
 * lifecycle are frozen by the API contract. */

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import release from '@boundaries/release-metadata.json';
import nagpurProvenance from '@boundaries/nagpur.provenance.json';
import bengaluruProvenance from '@boundaries/bengaluru-urban.provenance.json';
import mumbaiCityProvenance from '@boundaries/mumbai-city.provenance.json';
import nagpurGeometryRaw from '@validated/nagpur.geojson?raw';
import bengaluruGeometryRaw from '@validated/bengaluru-urban.geojson?raw';
import mumbaiCityGeometryRaw from '@validated/mumbai-city.geojson?raw';
import { config } from '../config';
import type { SummaryView } from '../viewmodel/mapper';
import {
  catalogEnvelopeGeometry,
  cityForRegionId,
  type CityCatalogEntry,
} from '../catalog/cities';

type Step = 'concern' | 'evidence' | 'review' | 'handoff';
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'concern', label: 'Concern' }, { id: 'evidence', label: 'Evidence' },
  { id: 'review', label: 'Review' }, { id: 'handoff', label: 'Handoff' },
];

const CONCERNS = [
  { code: 'WATER_BODY_SHRINKAGE', label: 'Surface-water change', detail: 'A mapped change that should be checked on the ground.' },
  { code: 'VEGETATION_LOSS', label: 'Vegetation change', detail: 'A detected change that should be checked on the ground.' },
  { code: 'LAND_ENCROACHMENT', label: 'Land or civic concern', detail: 'A request for inspection — not a legal finding.' },
  { code: 'WASTE_DUMPING', label: 'Waste or discharge', detail: 'A suspected waste, sewage, or discharge concern.' },
] as const;

const AUTHORITIES = [
  { id: 'mpcb', name: 'Maharashtra Pollution Control Board' },
  { id: 'nmc', name: 'Nagpur Municipal Corporation' },
  { id: 'maharashtra-forest', name: 'Maharashtra Forest Department' },
  { id: 'aaple-sarkar', name: 'Aaple Sarkar (state escalation)' },
] as const;

const AUTHORITY_NAMES: Record<string, string> = {
  mpcb: 'Maharashtra Pollution Control Board',
  nmc: 'Nagpur Municipal Corporation',
  'maharashtra-forest': 'Maharashtra Forest Department',
  'aaple-sarkar': 'Aaple Sarkar (state escalation)',
  'us-epa': 'U.S. Environmental Protection Agency',
  'dc-311': 'District of Columbia 311',
  'environment-agency-england': 'Environment Agency (England)',
  'daera-ni': 'DAERA (Northern Ireland)',
  cpgrams: 'CPGRAMS (national escalation)',
  cpcb: 'Central Pollution Control Board',
  kspcb: 'Karnataka State Pollution Control Board',
};

export interface ReportConcernProps {
  open: boolean;
  onClose: () => void;
  regionName: string;
  regionId: string;
  analysisSnapshot?: SummaryView;
  coordinates?: [number, number];
  catalogEntry?: CityCatalogEntry;
}

const DIGEST_FALLBACK = `sha256:${'0'.repeat(64)}`;
async function digest(value: string): Promise<string> {
  try {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return `sha256:${Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  } catch { return DIGEST_FALLBACK; }
}
async function digestBytes(value: ArrayBuffer): Promise<string> {
  try {
    const bytes = await crypto.subtle.digest('SHA-256', value);
    return `sha256:${Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  } catch { return DIGEST_FALLBACK; }
}

const nagpurGeometry = JSON.parse(nagpurGeometryRaw) as Record<string, unknown>;
const bengaluruGeometry = JSON.parse(bengaluruGeometryRaw) as Record<string, unknown>;
const mumbaiCityGeometry = JSON.parse(mumbaiCityGeometryRaw) as Record<string, unknown>;

export function ReportConcern({ open, onClose, regionName, regionId, analysisSnapshot, coordinates, catalogEntry }: ReportConcernProps) {
  const [step, setStep] = useState<Step>('concern');
  const [concerns, setConcerns] = useState<string[]>([CONCERNS[0].code]);
  const [observation, setObservation] = useState('');
  const [authority, setAuthority] = useState<string>(AUTHORITIES[0].id);
  const [locationSharing, setLocationSharing] = useState(true);
  const [truthfulness, setTruthfulness] = useState(false);
  const [geminiConsent, setGeminiConsent] = useState(false);
  const [reportConsent, setReportConsent] = useState(false);
  const [complainantName, setComplainantName] = useState('');
  const [complainantAddress, setComplainantAddress] = useState('');
  const [complainantEmail, setComplainantEmail] = useState('');
  const [complainantPhone, setComplainantPhone] = useState('');
  const [identityConfirmation, setIdentityConfirmation] = useState(false);
  const [contactConsent, setContactConsent] = useState(false);
  const [personsFacilitiesDepartments, setPersonsFacilitiesDepartments] = useState('');
  const [timeline, setTimeline] = useState('');
  const [priorComplaintHistory, setPriorComplaintHistory] = useState('');
  const [requestedAction, setRequestedAction] = useState('');
  const [signatureDate, setSignatureDate] = useState('');
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [reportId, setReportId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const titleId = useId();
  const observationId = useId();
  const authorityId = useId();

  useEffect(() => {
    if (!open) return;
    setStep('concern'); setConcerns([CONCERNS[0].code]); setObservation('');
    setAuthority(catalogEntry?.jurisdiction.authorityIds[0] ?? AUTHORITIES[0].id); setLocationSharing(false); setTruthfulness(false); setGeminiConsent(false); setReportConsent(false);
    setComplainantName(''); setComplainantAddress(''); setComplainantEmail(''); setComplainantPhone('');
    setIdentityConfirmation(false); setContactConsent(false); setPersonsFacilitiesDepartments(''); setTimeline('');
    setPriorComplaintHistory(''); setRequestedAction(''); setSignatureDate(''); setSignatureFile(null);
    setFiles([]); setReportId(null); setAccessToken(null); setStatusNotice('');
  }, [open, regionId, catalogEntry]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  const selectedConcern = CONCERNS.find((item) => item.code === concerns[0]) ?? CONCERNS[0];
  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const canContinueFromReview = reportConsent && locationSharing && truthfulness && geminiConsent && signatureDate.length > 0 && observation.trim().length > 0;
  const city = catalogEntry ?? cityForRegionId(regionId);
  const availableAuthorities = city
    ? city.routingCoverage === 'FULLY_SUPPORTED' && city.jurisdiction.authorityIds.length
      ? city.jurisdiction.authorityIds.map((id) => ({ id, name: AUTHORITY_NAMES[id] ?? id }))
      : [{ id: 'export-only', name: city.routingCoverage === 'REPORT_GENERATION_ONLY' ? 'Export only — authority routing not verified' : 'Export only — no verified authority' }]
    : AUTHORITIES;
  const selectedAuthority = availableAuthorities.find((item) => item.id === authority) ?? availableAuthorities[0];
  const validatedBengaluru = city?.slug === 'bengaluru';
  const validatedMumbaiCity = city?.regionId === 'district:mumbai-city';
  const boundary = city?.boundary.kind === 'catalog-envelope'
    ? city.boundary
    : {
      ...(validatedMumbaiCity ? mumbaiCityProvenance : validatedBengaluru ? bengaluruProvenance : nagpurProvenance),
      sha256: city?.boundary.sha256 ?? `sha256:${validatedMumbaiCity ? release.districts['mumbai-city'].sha256 : validatedBengaluru ? release.districts['bengaluru-urban'].sha256 : release.districts.nagpur.sha256}`,
    };
  const geometry = city?.boundary.kind === 'catalog-envelope'
    ? catalogEnvelopeGeometry(city)
    : validatedMumbaiCity ? mumbaiCityGeometry : validatedBengaluru ? bengaluruGeometry : nagpurGeometry;
  const analysis = analysisSnapshot?.indicators ?? [];
  const primaryIndicator = analysis.find((item) => (
    concerns.includes('WATER_BODY_SHRINKAGE') && item.id === 'surface-water'
    || concerns.includes('VEGETATION_LOSS') && item.id === 'vegetation'
    || concerns.includes('LAND_ENCROACHMENT') && item.id === 'built-up'
  )) ?? analysis[0];

  const makeSnapshot = async (item: SummaryView['indicators'][number]) => ({
    indicatorId: item.id, baseline: item.metric.baselineRaw, comparison: item.metric.comparisonRaw,
    value: item.metric.percentRaw, unit: item.unit || 'proxy', methodId: `precomputed-${item.id}`,
    methodVersion: '1.0.0', processingRunId: `dashboard:${regionId}`,
    evidenceSha256: await digest(JSON.stringify(item)), qualityStatus: item.qualityLevel,
    validationStatus: 'EXPLORATORY_ONLY' as const, qualityLevel: item.qualityLevel,
    methodsConflict: item.id === 'built-up' && /nagpur/i.test(regionId),
  });

  const fallbackIndicatorId = concerns.includes('VEGETATION_LOSS') ? 'vegetation'
    : concerns.includes('LAND_ENCROACHMENT') ? 'built-up' : 'surface-water';
  const makeUnavailableSnapshot = async (indicatorId: 'surface-water' | 'vegetation' | 'built-up') => ({
    indicatorId,
    baseline: null,
    comparison: null,
    value: null,
    unit: 'not available',
    methodId: 'not-run',
    methodVersion: '0.0.0',
    processingRunId: `not-run:${regionId}`,
    evidenceSha256: await digest(JSON.stringify({ regionId, indicatorId, catalogVersion: city?.boundary.sha256 })),
    qualityStatus: 'NOT_RUN',
    validationStatus: 'NOT_RUN' as const,
    qualityLevel: 'unknown' as const,
    methodsConflict: false,
  });

  const createReport = async () => {
    setCreating(true); setStatusNotice('Creating the report PDF and evidence package…');
    try {
      if (signatureFile && !['image/jpeg', 'application/pdf'].includes(signatureFile.type)) {
        throw new Error('The signature file must be a JPEG image or PDF.');
      }
      const snapshots = analysis.length
        ? await Promise.all(analysis.map(makeSnapshot))
        : [await makeUnavailableSnapshot(fallbackIndicatorId)];
      const point = coordinates ?? city?.centroid ?? (validatedBengaluru ? [77.59, 12.97] : [79.08, 21.15]);
      const payload = {
        regionId, countryCode: city?.countryCode ?? 'IN', administrativeAreas: city?.administrativeAreas ?? [validatedBengaluru ? 'Karnataka' : 'Maharashtra'],
        district: city?.district ?? (validatedBengaluru ? 'Bengaluru Urban' : 'Nagpur'), municipality: city?.municipality ?? (validatedBengaluru ? null : 'Nagpur'),
        postalCode: null, coordinates: { longitude: point[0], latitude: point[1] },
        boundary: {
          sourceName: boundary.sourceName, sourceUrl: boundary.sourceUrl, license: boundary.license,
          attribution: boundary.attribution, sha256: boundary.sha256,
          disclaimer: release.disclaimer, geometry,
        },
        concernCode: concerns[0], issueCodes: concerns, evidence: snapshots.find((item) => item.indicatorId === (primaryIndicator?.id ?? fallbackIndicatorId)) ?? snapshots[0],
        evidenceSnapshots: snapshots, analysis: { regionName, periods: analysisSnapshot ? { baseline: analysisSnapshot.baseline, comparison: analysisSnapshot.comparison } : null },
        reportTitle: `Environmental concern request for verification — ${regionName}`,
        receivingAuthority: selectedAuthority.name,
        complainant: { name: complainantName || null, organization: null, address: complainantAddress || null, email: complainantEmail || null, phone: complainantPhone || null, identityConfirmation, contactConsent },
        personsFacilitiesDepartments: personsFacilitiesDepartments || null,
        timeline: timeline || null,
        priorComplaintHistory: priorComplaintHistory || null,
        requestedAction: requestedAction || null,
        signatureDate,
        signatureAttachment: signatureFile ? {
          name: signatureFile.name,
          mediaType: signatureFile.type,
          bytes: signatureFile.size,
          sha256: await digestBytes(await signatureFile.arrayBuffer()),
        } : null,
        geminiConsent,
        observation: observation.trim(), locale: 'en',
        consent: { reviewed: true, truthfulness, locationSharing, attachmentsSharing: files.length > 0, manualSubmission: true, privacyNoticeVersion: '2026-08-05' },
        attachments: await Promise.all(files.slice(0, 6).map(async (file) => ({ name: file.name, mediaType: file.type, bytes: file.size, sha256: await digestBytes(await file.arrayBuffer()) }))),
        municipalConfirmed: city?.slug === 'nagpur',
      };
      const form = new FormData();
      form.append('report', JSON.stringify(payload));
      files.slice(0, 6).forEach((file) => form.append('attachments', file, file.name));
      if (signatureFile) form.append('signature', signatureFile, signatureFile.name);
      const response = await fetch(`${config.apiBaseUrl}/api/v1/reports`, { method: 'POST', body: form, headers: { 'Idempotency-Key': `browser-${crypto.randomUUID()}` } });
      const result = await response.json() as { data?: { id: string; artifacts?: unknown[] }; meta?: { mock?: boolean }; detail?: string };
      if (!response.ok || !result.data) throw new Error(result.detail || 'The report could not be created.');
      setReportId(result.data.id); setAccessToken(response.headers.get('X-Report-Access'));
      setStatusNotice('Report created. Download the generated PDF or evidence package, then review it before manual handoff.');
      setStep('handoff');
    } catch (error) { setStatusNotice(error instanceof Error ? error.message : 'The report could not be created.'); }
    finally { setCreating(false); }
  };

  const download = async (artifact: 'pdf' | 'zip') => {
    if (!reportId || !accessToken) return;
    const response = await fetch(`${config.apiBaseUrl}/api/v1/reports/${reportId}/artifacts/${artifact}`, { headers: { 'X-Report-Access': accessToken } });
    if (!response.ok) { setStatusNotice('The report has expired or the artifact is unavailable.'); return; }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `sparc-report-${artifact}.${artifact}`; anchor.click(); URL.revokeObjectURL(url);
  };

  const openPortal = () => {
    if (!reportId || !accessToken) { setStatusNotice('Create the report before opening a verified portal.'); return; }
    if (city?.routingCoverage !== 'FULLY_SUPPORTED') {
      setStatusNotice(city?.routingCoverage === 'REPORT_GENERATION_ONLY'
        ? 'Authority routing is not verified for this location. Download the report package for local handoff.'
        : 'No verified authority is available for this location. Download the report package for local handoff.');
      return;
    }
    void fetch(`${config.apiBaseUrl}/api/v1/reports/${reportId}/submit-handoff`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Report-Access': accessToken }, body: JSON.stringify({ authorityId: authority, confirmReview: true }) })
      .then(async (response) => { const result = await response.json(); const url = result?.data?.handoff?.officialUrl; if (!response.ok || !url) throw new Error(result?.detail || 'This authority is not verified for the selected location.'); window.open(url, '_blank', 'noopener,noreferrer'); setStatusNotice('Official portal opened. Complete any login, CAPTCHA, or OTP there yourself.'); })
      .catch((error: unknown) => setStatusNotice(error instanceof Error ? error.message : 'Manual handoff is unavailable.'));
  };

  const next = () => { if (step === 'concern') setStep('evidence'); else if (step === 'evidence') setStep('review'); else if (step === 'review' && canContinueFromReview) void createReport(); };
  const back = () => { const previous = STEPS[stepIndex - 1]; if (previous) setStep(previous.id); };

  /* Portalled to <body>, not rendered in place.
     The drawer this dialog is launched from is both `transform`ed (it slides in)
     and `overflow-y: auto`. A transform makes an element the containing block
     for `position: fixed` descendants, so a fixed overlay inside it is measured
     against the drawer's *scrollable* box — the full height of the dashboard,
     not the visible window — and then scrolls away with the content. In
     practice the dialog opened somewhere above the fold and only its last
     button was reachable. A portal takes it out of that ancestor entirely, so
     `position: fixed; inset: 0` means the viewport again.
     Portalling also makes the overlay a styling scope root rather than a
     descendant of the drawer; daoism.css names `.report-overlay` alongside
     `.sparc-panel` in its token selector for exactly that reason. */
  return createPortal(
    <div className="report-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="report-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="report-dialog__topline"><p className="report-dialog__eyebrow">REPORT WORKFLOW · CODEX CONTRACT</p><button type="button" className="console__close" onClick={onClose} aria-label="Close report workflow">×</button></div>
        <h2 id={titleId}>Report an environmental concern</h2>
        <p className="report-dialog__lede">Create a neutral request for inspection using the analysis currently shown for <strong>{regionName}</strong>.</p>
        <ol className="report-steps" aria-label="Report workflow steps">{STEPS.map((item, index) => <li key={item.id} className={index <= stepIndex ? 'report-steps__item report-steps__item--active' : 'report-steps__item'}><span className="report-steps__number" aria-hidden="true">{index + 1}</span><span>{item.label}</span></li>)}</ol>

        {step === 'concern' ? <div className="report-section"><p className="report-section__kicker">Step 1 of 4</p><h3>What should be checked?</h3><p className="report-section__hint">Select one or more neutral categories. SPARC will not label a violation.</p><div className="report-choice-list">{CONCERNS.map((item) => <label key={item.code} className={concerns.includes(item.code) ? 'report-choice report-choice--selected' : 'report-choice'}><input type="checkbox" checked={concerns.includes(item.code)} onChange={(event) => setConcerns((current) => event.target.checked ? [...new Set([...current, item.code])] : current.filter((code) => code !== item.code))} /><span><strong>{item.label}</strong><small>{item.detail}</small></span></label>)}</div><p className="report-metadata"><span>Region</span>{regionName}<code>{regionId}</code></p></div> : null}

        {step === 'evidence' ? <div className="report-section"><p className="report-section__kicker">Step 2 of 4</p><h3>Add context for review</h3><p className="report-section__hint">Your words stay marked as a user observation. Generated PDF and evidence files are created by SPARC; attachments here are optional photos only.</p><label className="report-field" htmlFor={observationId}><span>What did you observe?</span><textarea id={observationId} value={observation} onChange={(event) => setObservation(event.target.value)} maxLength={4000} placeholder="Describe what should be checked, without claiming who is responsible." rows={5} /><small>{observation.length}/4000 characters</small></label><label className="report-upload"><span className="btn">Add photos</span><input type="file" accept="image/png" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 6))} /><small>{files.length ? `${files.length} photo${files.length === 1 ? '' : 's'} selected` : 'Up to 6 photos · 5 MiB each · PNG'}</small></label><div className="callout callout--warn"><p className="callout__title">Evidence status: {analysis.length ? 'verification-only' : 'report/export scope'}</p><p className="callout__body">{analysis.length ? 'The generated package includes the selected dashboard analyses, methods, periods, and provenance. It does not assert a measured violation.' : 'No validated analytical pack is available for this city. The package will record your observation and the requested inspection without inventing a satellite value.'}</p></div></div> : null}

        {step === 'review' ? <div className="report-section">
          <p className="report-section__kicker">Step 3 of 4</p><h3>Complete report details</h3>
          <div className="report-review"><p><span>Categories</span>{concerns.map((code) => CONCERNS.find((item) => item.code === code)?.label ?? code).join(', ')}</p><p><span>Analysis included</span>{analysis.length ? `${analysis.length} dashboard indicator${analysis.length === 1 ? '' : 's'}` : 'Report/export scope; no validated pack'}</p><p><span>Observation</span>{observation || 'No observation entered yet.'}</p><p><span>Authority route</span>{selectedAuthority.name}</p></div>
          <label className="report-field" htmlFor={authorityId}><span>Preferred manual handoff</span><select id={authorityId} value={authority} onChange={(event) => setAuthority(event.target.value)}>{availableAuthorities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="report-field"><span>Complainant name (optional)</span><input value={complainantName} onChange={(event) => setComplainantName(event.target.value)} maxLength={160} placeholder="Leave blank for an anonymous report" /></label>
          <label className="report-field"><span>Address (optional)</span><textarea value={complainantAddress} onChange={(event) => setComplainantAddress(event.target.value)} maxLength={500} rows={2} placeholder="Added locally after the Gemini draft" /></label>
          <div className="report-review"><p><span>Contact email</span><input value={complainantEmail} onChange={(event) => setComplainantEmail(event.target.value)} maxLength={254} /></p><p><span>Contact phone</span><input value={complainantPhone} onChange={(event) => setComplainantPhone(event.target.value)} maxLength={40} /></p></div>
          <label className="report-field"><span>Persons, facilities or departments concerned (optional)</span><textarea value={personsFacilitiesDepartments} onChange={(event) => setPersonsFacilitiesDepartments(event.target.value)} maxLength={1000} rows={2} placeholder="Describe neutrally; do not assert responsibility or illegality" /></label>
          <label className="report-field"><span>Timeline of events (optional)</span><textarea value={timeline} onChange={(event) => setTimeline(event.target.value)} maxLength={2000} rows={2} placeholder="Dates or sequence, if known" /></label>
          <label className="report-field"><span>Prior complaint history (optional)</span><textarea value={priorComplaintHistory} onChange={(event) => setPriorComplaintHistory(event.target.value)} maxLength={2000} rows={2} placeholder="Reference numbers or state that none are known" /></label>
          <label className="report-field"><span>Requested action (optional)</span><textarea value={requestedAction} onChange={(event) => setRequestedAction(event.target.value)} maxLength={1000} rows={2} placeholder="For example: inspect the location and advise on next steps" /></label>
          <label className="report-field"><span>Date for the printed signature</span><input type="date" value={signatureDate} onChange={(event) => setSignatureDate(event.target.value)} required /></label>
          <label className="report-upload report-upload--signature">
            <span className="btn">Add signature file (optional)</span>
            <input type="file" accept="image/jpeg,application/pdf" onChange={(event) => setSignatureFile(event.target.files?.[0] ?? null)} />
            <small>{signatureFile ? `${signatureFile.name} · ${signatureFile.type === 'application/pdf' ? 'PDF' : 'JPEG'}` : 'JPEG or PDF · included with the report package; JPEG signatures are shown in the PDF'}</small>
          </label>
          <div className="report-checks">
            <label>
              <input
                type="checkbox"
                checked={reportConsent}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setReportConsent(checked);
                  setIdentityConfirmation(checked);
                  setContactConsent(checked);
                  setLocationSharing(checked);
                  setTruthfulness(checked);
                  setGeminiConsent(checked);
                }}
              />
              I confirm the details supplied are mine, consent to sharing the exact map location and any contact details provided for verification, reviewed this package as truthful to the best of my knowledge, and consent to sending only non-identifying report text and analysis facts to Google Gemini for drafting.
            </label>
          </div>
          <div className="callout"><p className="callout__title">Required declaration</p><p className="callout__body">This package records an observation and request for verification. It does not prove a violation, identify a responsible party, or provide legal advice. The signature line is intentionally blank for printing.</p></div>
        </div> : null}

        {step === 'handoff' ? <div className="report-section report-section--complete"><p className="report-section__kicker">Step 4 of 4 · Report ready</p><h3>Download and hand off manually</h3><p className="report-section__hint">Review the generated report before opening an official portal. SPARC never submits a complaint or handles government credentials.</p><p className="report-success" role="status">✓ {statusNotice}</p><div className="report-actions report-actions--downloads"><button type="button" className="btn btn--primary" onClick={() => void download('pdf')} disabled={!reportId}>Download report PDF</button><button type="button" className="btn" onClick={() => void download('zip')} disabled={!reportId}>Download evidence package</button></div><div className="callout callout--warn"><p className="callout__title">Manual portal handoff only</p><p className="callout__body">{city?.routingCoverage === 'FULLY_SUPPORTED' ? 'Open the official portal yourself, complete any login, CAPTCHA, or OTP there, and optionally record your own reference number.' : city?.routingCoverage === 'REPORT_GENERATION_ONLY' ? 'Authority routing is not verified for this location. Use the downloaded package for local handoff.' : 'No verified authority route is available for this location. Use the downloaded package for local handoff.'}</p></div><button type="button" className="btn btn--primary" onClick={openPortal} disabled={!reportId || city?.routingCoverage !== 'FULLY_SUPPORTED'}>Open official portal</button></div> : null}

        {statusNotice && step !== 'handoff' ? <p className="report-status-notice" role="status">{statusNotice}</p> : null}
        <div className="report-actions">{stepIndex > 0 && step !== 'handoff' ? <button type="button" className="btn btn--ghost" onClick={back}>Back</button> : null}{step !== 'handoff' ? <button type="button" className="btn btn--primary" onClick={next} disabled={(step === 'concern' && concerns.length === 0) || (step === 'review' && (!canContinueFromReview || creating))}>{creating ? 'Creating package…' : step === 'review' ? 'Create report package' : 'Continue'}</button> : <button type="button" className="btn btn--ghost" onClick={onClose}>Return to dashboard</button>}</div>
      </section>
    </div>,
    document.body,
  );
}
