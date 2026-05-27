const PDFDocument = require('pdfkit');
const path = require('path');
const FONT_REGULAR = path.join(__dirname, '..', '..', 'node_modules', '@fontsource', 'roboto', 'files', 'roboto-cyrillic-400-normal.woff');
const FONT_BOLD = path.join(__dirname, '..', '..', 'node_modules', '@fontsource', 'roboto', 'files', 'roboto-cyrillic-700-normal.woff');

function money(value, currency = 'EUR') {
  const num = Number(value || 0);
  const formatted = Number.isInteger(num) ? String(num) : num.toFixed(2);
  return `${formatted} ${currency}`;
}

function sumItems(items = []) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
}

function currencyLabel(currency) {
  return currency || 'EUR';
}

function generateOfferPdfBuffer({ offer, lead, items = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 42,
      bufferPages: true,
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('regular', FONT_REGULAR);
    doc.registerFont('bold', FONT_BOLD);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const currency = currencyLabel(offer.currency);
    const total = Number(offer.total || sumItems(items));
    const offerDate = new Date(offer.created_at || Date.now());
    const validUntil = offer.valid_until ? new Date(offer.valid_until) : null;

    doc.font('bold').fontSize(22).fillColor('#111827').text('Коммерческое предложение', { align: 'left' });
    doc.moveDown(0.2);
    doc.font('regular').fontSize(10).fillColor('#4b5563').text('BODEX Bulgaria Virtual Office');
    doc.text(`Offer No: ${offer.offer_number || '—'}`);
    doc.text(`Date: ${offerDate.toLocaleDateString('bg-BG')}`);
    if (validUntil) doc.text(`Valid until: ${validUntil.toLocaleDateString('bg-BG')}`);

    doc.moveDown(0.9);

    const leftX = doc.x;
    const topY = doc.y;
    const leftW = pageWidth * 0.48;
    const rightX = doc.x + leftW + 24;

    doc.roundedRect(leftX, topY, leftW, 118, 10).strokeColor('#d1d5db').stroke();
    doc.roundedRect(rightX, topY, pageWidth - leftW - 24, 118, 10).strokeColor('#d1d5db').stroke();

    doc.font('bold').fontSize(11).fillColor('#111827').text('Клиент', leftX + 12, topY + 12);
    doc.font('regular').fontSize(10).fillColor('#374151');
    doc.text(lead.company_name || '—', leftX + 12, topY + 32, { width: leftW - 24 });
    doc.text(`Contact: ${lead.contact_name || '—'}`, leftX + 12, topY + 50, { width: leftW - 24 });
    doc.text(`Phone: ${lead.phone || '—'}`, leftX + 12, topY + 68, { width: leftW - 24 });
    doc.text(`Email: ${lead.email || '—'}`, leftX + 12, topY + 86, { width: leftW - 24 });

    doc.font('bold').fontSize(11).fillColor('#111827').text('Детали', rightX + 12, topY + 12);
    doc.font('regular').fontSize(10).fillColor('#374151');
    doc.text(`City: ${lead.city || '—'}`, rightX + 12, topY + 32, { width: pageWidth - leftW - 48 });
    doc.text(`Source: ${lead.source || '—'}`, rightX + 12, topY + 50, { width: pageWidth - leftW - 48 });
    doc.text(`Status: ${lead.status || '—'}`, rightX + 12, topY + 68, { width: pageWidth - leftW - 48 });
    doc.text(`Interest: ${lead.interest_products || '—'}`, rightX + 12, topY + 86, { width: pageWidth - leftW - 48 });

    doc.y = topY + 136;
    doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.8);

    doc.font('bold').fontSize(13).fillColor('#111827').text('Продукты и цена');
    doc.moveDown(0.4);

    const tableTop = doc.y;
    const columns = [
      { key: 'name', label: 'Product', width: 210 },
      { key: 'qty', label: 'Qty', width: 44 },
      { key: 'price', label: `Цена (${currency})`, width: 88 },
      { key: 'total', label: 'Сума', width: 88 },
    ];

    let x = doc.x;
    let y = tableTop;
    const rowH = 28;
    const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);

    doc.roundedRect(x, y, tableWidth, rowH, 6).fillAndStroke('#f9fafb', '#d1d5db');
    let currentX = x;
    doc.font('bold').fontSize(9).fillColor('#374151');
    for (const col of columns) {
      doc.text(col.label, currentX + 6, y + 9, { width: col.width - 12, align: 'left' });
      currentX += col.width;
    }

    y += rowH;
    doc.font('regular').fontSize(9).fillColor('#111827');
    items.forEach((item, index) => {
      if (y > doc.page.height - 140) {
        doc.addPage();
        y = doc.y;
      }
      const lineTotal = Number(item.quantity || 0) * Number(item.unit_price || 0);
      doc.rect(x, y, tableWidth, rowH).strokeColor('#e5e7eb').stroke();

      const rowValues = [
        String(item.name || item.product_name || '—'),
        String(item.quantity || '1'),
        money(item.unit_price, currency),
        money(lineTotal, currency),
      ];

      currentX = x;
      rowValues.forEach((value, idx) => {
        const width = columns[idx].width;
        doc.text(value, currentX + 6, y + 9, { width: width - 12 });
        currentX += width;
      });
      y += rowH;
    });

    if (items.length === 0) {
      doc.text('Не добавлены позиции.', x, y + 10);
      y += 20;
    }

    y += 12;
    doc.font('bold').fontSize(12).fillColor('#111827').text(`Subtotal: ${money(total, currency)}`, x, y, {
      width: tableWidth,
      align: 'right',
    });

    if (Number(offer.discount_pct || 0) > 0) {
      const discountAmount = total * (Number(offer.discount_pct) / 100);
      const afterDiscount = total - discountAmount;
      doc.font('regular').fontSize(10).fillColor('#374151').text(
        `Discount ${Number(offer.discount_pct)}%: -${money(discountAmount, currency)}`,
        x,
        y + 16,
        { width: tableWidth, align: 'right' }
      );
      doc.font('bold').fontSize(13).fillColor('#111827').text(
        `Total: ${money(afterDiscount, currency)}`,
        x,
        y + 34,
        { width: tableWidth, align: 'right' }
      );
    } else {
      doc.font('bold').fontSize(13).fillColor('#111827').text(`Total: ${money(total, currency)}`, x, y + 16, {
        width: tableWidth,
        align: 'right',
      });
    }

    if (offer.notes) {
      doc.moveDown(2);
      doc.font('bold').fontSize(11).fillColor('#111827').text('Бележки');
      doc.font('regular').fontSize(10).fillColor('#374151').text(String(offer.notes), {
        width: pageWidth,
        align: 'left',
      });
    }

    doc.moveDown(1.4);
    doc.font('regular').fontSize(9).fillColor('#6b7280').text(
      'Документът е генериран автоматично от BODEX Virtual Office въз основа на данните от CRM и ръчно избрани цени на продукти.',
      {
        width: pageWidth,
      }
    );

    doc.end();
  });
}

module.exports = {
  generateOfferPdfBuffer,
};
