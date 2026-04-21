import path from 'path';
import PDFDocument from 'pdfkit';
import { TransactionStage } from '../enums/transaction-stage.enum';
import { TransactionDocument } from '../schemas/transaction.schema';

const FONTS_DIR = path.resolve(__dirname, '..', '..', '..', 'assets', 'fonts');
const FONT_REGULAR_PATH = path.join(FONTS_DIR, 'DejaVuSans.ttf');
const FONT_BOLD_PATH = path.join(FONTS_DIR, 'DejaVuSans-Bold.ttf');
const FONT_REGULAR = 'Body';
const FONT_BOLD = 'BodyBold';

interface PopulatedAgent {
  _id: unknown;
  name?: string;
  email?: string;
}

interface StageColor {
  bg: string;
  text: string;
}

const STAGE_LABELS: Readonly<Record<TransactionStage, string>> = {
  [TransactionStage.AGREEMENT]: 'Anlaşma',
  [TransactionStage.EARNEST_MONEY]: 'Kaparo',
  [TransactionStage.TITLE_DEED]: 'Tapu',
  [TransactionStage.COMPLETED]: 'Tamamlandı',
};

const STAGE_COLORS: Readonly<Record<TransactionStage, StageColor>> = {
  [TransactionStage.AGREEMENT]: { bg: '#e2e8f0', text: '#1e293b' },
  [TransactionStage.EARNEST_MONEY]: { bg: '#fef3c7', text: '#92400e' },
  [TransactionStage.TITLE_DEED]: { bg: '#dbeafe', text: '#1e40af' },
  [TransactionStage.COMPLETED]: { bg: '#d1fae5', text: '#065f46' },
};

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;
const BRAND_COLOR = '#4f46e5';
const MUTED_COLOR = '#64748b';
const DIVIDER_COLOR = '#e2e8f0';
const TEXT_COLOR = '#0f172a';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | string | undefined | null): string {
  if (!value) {
    return '-';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function renderAgent(raw: unknown, fallback: string): string {
  const agent = raw as PopulatedAgent | null | undefined;
  if (!agent || typeof agent !== 'object') {
    return fallback;
  }
  return agent.name ? agent.name : fallback;
}

function agentEmail(raw: unknown): string {
  const agent = raw as PopulatedAgent | null | undefined;
  if (!agent || typeof agent !== 'object' || !agent.email) {
    return '-';
  }
  return agent.email;
}

function drawDivider(doc: PDFKit.PDFDocument, y: number): void {
  doc
    .save()
    .strokeColor(DIVIDER_COLOR)
    .lineWidth(0.5)
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y)
    .stroke()
    .restore();
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  doc
    .fillColor(BRAND_COLOR)
    .font(FONT_BOLD)
    .fontSize(11)
    .text(title.toUpperCase(), PAGE_MARGIN, doc.y, {
      characterSpacing: 1,
    });
  doc.moveDown(0.4);
}

function drawKeyValue(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  options: { bold?: boolean } = {},
): void {
  const labelWidth = 160;
  const y = doc.y;
  doc
    .fillColor(MUTED_COLOR)
    .font(FONT_REGULAR)
    .fontSize(10)
    .text(label, PAGE_MARGIN, y, { width: labelWidth });
  doc
    .fillColor(TEXT_COLOR)
    .font(options.bold ? FONT_BOLD : FONT_REGULAR)
    .fontSize(10)
    .text(value, PAGE_MARGIN + labelWidth, y, {
      width: CONTENT_WIDTH - labelWidth,
    });
  doc.moveDown(0.2);
}

function drawStageBadge(
  doc: PDFKit.PDFDocument,
  stage: TransactionStage,
  x: number,
  y: number,
): void {
  const label = STAGE_LABELS[stage];
  const colors = STAGE_COLORS[stage];
  doc.font(FONT_BOLD).fontSize(9);
  const textWidth = doc.widthOfString(label);
  const padX = 10;
  const padY = 4;
  const badgeWidth = textWidth + padX * 2;
  const badgeHeight = 18;

  doc.save().roundedRect(x, y, badgeWidth, badgeHeight, 9).fill(colors.bg);
  doc
    .fillColor(colors.text)
    .font(FONT_BOLD)
    .fontSize(9)
    .text(label, x + padX, y + padY + 1);
  doc.restore();
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  columns: Array<{ label: string; width: number; align?: 'left' | 'right' }>,
): void {
  const y = doc.y;
  const rowHeight = 22;

  doc.save().rect(PAGE_MARGIN, y, CONTENT_WIDTH, rowHeight).fill('#f1f5f9');
  doc.restore();

  let x = PAGE_MARGIN + 10;
  doc.fillColor(MUTED_COLOR).font(FONT_BOLD).fontSize(9);
  for (const col of columns) {
    doc.text(col.label.toUpperCase(), x, y + 7, {
      width: col.width - 10,
      align: col.align ?? 'left',
      characterSpacing: 0.5,
    });
    x += col.width;
  }
  doc.y = y + rowHeight;
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  columns: Array<{
    value: string;
    width: number;
    align?: 'left' | 'right';
    bold?: boolean;
  }>,
  options: { zebra?: boolean } = {},
): void {
  const y = doc.y;
  const rowHeight = 22;

  if (options.zebra) {
    doc
      .save()
      .rect(PAGE_MARGIN, y, CONTENT_WIDTH, rowHeight)
      .fill('#fafafa')
      .restore();
  }

  let x = PAGE_MARGIN + 10;
  for (const col of columns) {
    doc
      .fillColor(TEXT_COLOR)
      .font(col.bold ? FONT_BOLD : FONT_REGULAR)
      .fontSize(10)
      .text(col.value, x, y + 6, {
        width: col.width - 10,
        align: col.align ?? 'left',
      });
    x += col.width;
  }
  doc.y = y + rowHeight;
}

export async function buildTransactionPdf(
  transaction: TransactionDocument,
): Promise<Buffer> {
  const id = String(transaction._id);
  const createdAt = (transaction as unknown as { createdAt?: Date }).createdAt;
  const updatedAt = (transaction as unknown as { updatedAt?: Date }).updatedAt;

  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    info: {
      Title: `İşlem Raporu - ${transaction.title}`,
      Author: 'Emlak Komisyon',
      Subject: 'Transaction Report',
    },
  });

  doc.registerFont(FONT_REGULAR, FONT_REGULAR_PATH);
  doc.registerFont(FONT_BOLD, FONT_BOLD_PATH);

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc
    .fillColor(BRAND_COLOR)
    .font(FONT_BOLD)
    .fontSize(20)
    .text('EMLAK KOMİSYON', PAGE_MARGIN, PAGE_MARGIN);
  doc
    .fillColor(MUTED_COLOR)
    .font(FONT_REGULAR)
    .fontSize(10)
    .text('İşlem Raporu', PAGE_MARGIN, doc.y + 2);
  const headerBottomY = doc.y + 10;
  drawDivider(doc, headerBottomY);
  doc.y = headerBottomY + 14;

  doc
    .fillColor(TEXT_COLOR)
    .font(FONT_BOLD)
    .fontSize(16)
    .text(transaction.title, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.3);
  doc
    .fillColor(MUTED_COLOR)
    .font(FONT_REGULAR)
    .fontSize(9)
    .text(`İşlem No: ${id}`, PAGE_MARGIN, doc.y);
  doc.moveDown(0.5);

  const badgeY = doc.y;
  drawStageBadge(doc, transaction.stage, PAGE_MARGIN, badgeY);
  doc.y = badgeY + 26;

  doc.moveDown(0.3);
  drawKeyValue(doc, 'Oluşturma Tarihi', formatDate(createdAt));
  drawKeyValue(doc, 'Son Güncelleme', formatDate(updatedAt));
  drawKeyValue(doc, 'Toplam Komisyon', formatCurrency(transaction.totalFee), {
    bold: true,
  });
  doc.moveDown(0.6);
  drawDivider(doc, doc.y);
  doc.moveDown(0.6);

  drawSectionTitle(doc, 'Danışmanlar');
  drawKeyValue(
    doc,
    'İlan Danışmanı',
    renderAgent(transaction.listingAgent, '-'),
    { bold: true },
  );
  drawKeyValue(doc, '   E-posta', agentEmail(transaction.listingAgent));
  doc.moveDown(0.2);
  drawKeyValue(
    doc,
    'Satış Danışmanı',
    renderAgent(transaction.sellingAgent, '-'),
    { bold: true },
  );
  drawKeyValue(doc, '   E-posta', agentEmail(transaction.sellingAgent));
  doc.moveDown(0.6);
  drawDivider(doc, doc.y);
  doc.moveDown(0.6);

  drawSectionTitle(doc, 'Aşama Geçmişi');
  drawTableHeader(doc, [
    { label: '#', width: 40 },
    { label: 'Aşama', width: 180 },
    { label: 'Tarih', width: CONTENT_WIDTH - 220, align: 'right' },
  ]);
  const history = transaction.stageHistory ?? [];
  if (history.length === 0) {
    drawTableRow(doc, [
      { value: '-', width: 40 },
      { value: 'Kayıt yok', width: 180 },
      { value: '-', width: CONTENT_WIDTH - 220, align: 'right' },
    ]);
  } else {
    history.forEach((entry, idx) => {
      drawTableRow(
        doc,
        [
          { value: String(idx + 1), width: 40 },
          { value: STAGE_LABELS[entry.stage], width: 180, bold: true },
          {
            value: formatDate(new Date(entry.changedAt)),
            width: CONTENT_WIDTH - 220,
            align: 'right',
          },
        ],
        { zebra: idx % 2 === 1 },
      );
    });
  }
  doc.moveDown(0.6);
  drawDivider(doc, doc.y);
  doc.moveDown(0.6);

  drawSectionTitle(doc, 'Finansal Döküm');
  const isCompleted = transaction.stage === TransactionStage.COMPLETED;
  const fb = transaction.financialBreakdown;

  drawTableHeader(doc, [
    { label: 'Kalem', width: CONTENT_WIDTH - 220 },
    { label: 'Tutar', width: 120, align: 'right' },
    { label: 'Oran', width: 100, align: 'right' },
  ]);

  const totalFee = transaction.totalFee;
  const ratio = (value: number | undefined): string => {
    if (totalFee === 0 || value === undefined) {
      return '-';
    }
    return `%${Math.round((value / totalFee) * 100)}`;
  };

  drawTableRow(
    doc,
    [
      { value: 'Toplam Komisyon', width: CONTENT_WIDTH - 220, bold: true },
      {
        value: formatCurrency(totalFee),
        width: 120,
        align: 'right',
        bold: true,
      },
      { value: '%100', width: 100, align: 'right' },
    ],
    { zebra: true },
  );

  if (isCompleted && fb) {
    drawTableRow(doc, [
      { value: 'Şirket Payı', width: CONTENT_WIDTH - 220 },
      {
        value: formatCurrency(fb.companyCut ?? 0),
        width: 120,
        align: 'right',
      },
      { value: ratio(fb.companyCut), width: 100, align: 'right' },
    ]);
    drawTableRow(
      doc,
      [
        {
          value: `İlan Danışmanı Payı (${renderAgent(transaction.listingAgent, '-')})`,
          width: CONTENT_WIDTH - 220,
        },
        {
          value: formatCurrency(fb.listingAgentCut ?? 0),
          width: 120,
          align: 'right',
        },
        { value: ratio(fb.listingAgentCut), width: 100, align: 'right' },
      ],
      { zebra: true },
    );
    drawTableRow(doc, [
      {
        value: `Satış Danışmanı Payı (${renderAgent(transaction.sellingAgent, '-')})`,
        width: CONTENT_WIDTH - 220,
      },
      {
        value: formatCurrency(fb.sellingAgentCut ?? 0),
        width: 120,
        align: 'right',
      },
      { value: ratio(fb.sellingAgentCut), width: 100, align: 'right' },
    ]);
  } else {
    drawTableRow(doc, [
      {
        value: 'İşlem henüz tamamlanmadığı için hak ediş hesaplanmamıştır.',
        width: CONTENT_WIDTH,
      },
    ]);
  }

  doc.moveDown(1.2);
  drawDivider(doc, doc.y);
  doc.moveDown(0.5);

  doc
    .fillColor(MUTED_COLOR)
    .font(FONT_REGULAR)
    .fontSize(8)
    .text(
      `Bu rapor ${formatDate(new Date())} tarihinde otomatik oluşturulmuştur.`,
      PAGE_MARGIN,
      doc.y,
      { width: CONTENT_WIDTH, align: 'center' },
    );

  doc.end();
  return finished;
}

export function buildPdfFilename(transaction: TransactionDocument): string {
  const id = String(transaction._id);
  const normalized = transaction.title
    .toLowerCase()
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/i̇/g, 'i')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
  const slug =
    normalized
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'islem';
  return `${slug}-${id}.pdf`;
}
