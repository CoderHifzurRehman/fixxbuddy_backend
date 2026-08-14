const PDFDocument = require('pdfkit');
const axios = require('axios');

let cachedLogoBuffer = null;

async function getLogoBuffer() {
  if (cachedLogoBuffer) return cachedLogoBuffer;
  try {
    const url = 'https://fixxbuddy.s3.ap-south-1.amazonaws.com/Website/Images/fixxbuddy_black_logo.png';
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    cachedLogoBuffer = Buffer.from(response.data);
    return cachedLogoBuffer;
  } catch (error) {
    console.error('Failed to fetch invoice logo from S3, falling back to text:', error);
    return null;
  }
}

/**
 * Format a number as currency (Rs. XX.XX)
 */
function formatCurrency(val) {
  return `Rs. ${Number(val || 0).toFixed(2)}`;
}

/**
 * Helper to write text in columns
 */
function writeDetailRow(doc, label, value, y, leftAlignX = 50, rightAlignX = 220) {
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#4b5563').text(label, leftAlignX, y);
  doc.font('Helvetica').fillColor('#1f2937').text(value || 'N/A', rightAlignX, y, { width: 150 });
  return doc.heightOfString(value || 'N/A', { width: 150 }) + 5;
}

/**
 * Generate a PDF invoice matching the Urban Company invoice format
 * @param {Object} order - The cart/order database object populated with user and partner details
 * @returns {PDFDocument} - pdfkit PDF document stream
 */
async function generateInvoice(order) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const logoBuffer = await getLogoBuffer();

  // Extracted details
  const customerName = order.userId ? `${order.userId.firstName || ''} ${order.userId.lastName || ''}`.trim() : 'Customer';
  const deliveryAddress = order.deliveryAddress
    ? `${order.deliveryAddress.street || ''}, ${order.deliveryAddress.city || ''}, ${order.deliveryAddress.state || ''} - ${order.deliveryAddress.postalCode || ''}`.trim()
    : 'No delivery address provided';
  const stateCode = order.deliveryAddress ? `${order.deliveryAddress.state || ''}`.trim() : 'N/A';
  const contactNumber = order.contactNumber ? order.contactNumber.number : 'N/A';

  const partnerName = order.assignedPartner ? `${order.assignedPartner.firstName || ''} ${order.assignedPartner.lastName || ''}`.trim() : 'Partner';
  const partnerContact = order.assignedPartner ? order.assignedPartner.contactNumber : 'N/A';

  let partnerAddress = 'Not Available';
  if (order.assignedPartner && order.assignedPartner.address) {
    const addr = order.assignedPartner.address;
    const parts = [addr.street, addr.city, addr.state, addr.pincode].map(p => (p || '').trim()).filter(Boolean);
    if (parts.length > 0) {
      partnerAddress = parts.join(', ').trim();
    }
  }

  const partnerGSTIN = (order.assignedPartner && (order.assignedPartner.gstin || order.assignedPartner.gstNumber || order.assignedPartner.GSTIN)) || 'Not Available';

  const { formatDateToIST } = require('./dateUtils');
  const invoiceDateStr = formatDateToIST(order.completedAt || new Date());

  // Fetch associated quotation if present and not already populated
  let quotation = (order.quotationId && typeof order.quotationId === 'object' && order.quotationId.items) ? order.quotationId : null;
  if (!quotation) {
    try {
      const Quotation = require('../models/quotation.model');
      const query = [];
      if (order.quotationId) query.push({ _id: order.quotationId });
      if (order._id) query.push({ orderId: order._id.toString() });
      if (order.orderId) query.push({ orderId: order.orderId });

      if (query.length > 0) {
        quotation = await Quotation.findOne({ $or: query, status: 'Accepted' }) || await Quotation.findOne({ $or: query });
      }
    } catch (qErr) {
      console.error('Error fetching quotation for invoice:', qErr);
    }
  }

  const additionalCost = (order.additionalItemsCost || 0) || (order.quotationCost || 0) || (quotation ? quotation.totalAmount : 0);

  // ----------------------------------------------------
  // PAGE 1: Fixxbuddy Platform & Convenience Fee (30% share)
  // ----------------------------------------------------
  drawFixxbuddyInvoice(doc, order, customerName, deliveryAddress, stateCode, invoiceDateStr, logoBuffer);

  // ----------------------------------------------------
  // PAGE 2: Partner Service Charge Receipt (70% share)
  // ----------------------------------------------------
  doc.addPage();
  drawPartnerReceipt(doc, order, customerName, deliveryAddress, stateCode, invoiceDateStr, partnerName, partnerAddress, partnerGSTIN, logoBuffer);

  // ----------------------------------------------------
  // PAGE 3: Material Cost (if any)
  // ----------------------------------------------------
  if (additionalCost > 0 || (quotation && quotation.items && quotation.items.length > 0)) {
    doc.addPage();
    drawMaterialReceipt(doc, order, customerName, deliveryAddress, invoiceDateStr, partnerName, partnerAddress, partnerGSTIN, logoBuffer, quotation, additionalCost);
  }

  doc.end();
  return doc;
}

/**
 * Draws the Fixxbuddy Invoice (Platform and Convenience Fee)
 */
function drawFixxbuddyInvoice(doc, order, customerName, deliveryAddress, stateCode, invoiceDateStr, logoBuffer) {
  // Brand Header
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, 50, 48, { fit: [110, 20] });
    } catch (err) {
      console.error('Error rendering logo image in PDF, falling back to text:', err);
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#0d9488').text('FIXXBUDDY', 50, 50);
    }
  } else {
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0d9488').text('FIXXBUDDY', 50, 50);
  }
  doc.fontSize(8).font('Helvetica').fillColor('#6b7280');
  doc.text('Jasola Okhla, New Delhi - 110025', 50, 72);
  doc.text('GSTIN: 07AAKFF8559R1ZC', 50, 84);

  doc.fontSize(14).font('Helvetica-Bold').fillColor('#1f2937').text('ORIGINAL TAX INVOICE', 350, 50, { align: 'right' });

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 115).lineTo(545, 115).stroke();

  // Columns for info
  // Left Column: Customer details
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text('Customer Name', 50, 130);
  doc.font('Helvetica').fillColor('#4b5563').text(customerName, 50, 145);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Invoice No.', 50, 175);
  doc.font('Helvetica').fillColor('#4b5563').text(`FB-INV-${order.orderId || order._id}`, 50, 190);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Delivery Address', 50, 220);
  doc.font('Helvetica').fillColor('#4b5563').text(deliveryAddress, 50, 235, { width: 220 });

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Invoice Date', 50, 290);
  doc.font('Helvetica').fillColor('#4b5563').text(invoiceDateStr, 50, 305);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('State Name & Code', 50, 335);
  doc.font('Helvetica').fillColor('#4b5563').text(stateCode, 50, 350);

  // Right Column: Service Provider details
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text('DELIVERY SERVICE PROVIDER', 320, 130);

  doc.font('Helvetica-Bold').text('Business GSTIN', 320, 160);
  doc.font('Helvetica').fillColor('#4b5563').text('07AAKFF8559R1ZC', 320, 175);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Business Name', 320, 205);
  doc.font('Helvetica').fillColor('#4b5563').text('Fixxbuddy', 320, 220);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Address', 320, 250);
  doc.font('Helvetica').fillColor('#4b5563').text('Jasola Okhla, New Delhi - 110025', 320, 265, { width: 225 });

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('State Name & Code', 320, 320);
  doc.font('Helvetica').fillColor('#4b5563').text('Delhi 07', 320, 335);

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 380).lineTo(545, 380).stroke();

  // Table Headers
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text('Items', 50, 400);
  doc.text('Taxable Value', 380, 400, { align: 'right', width: 165 });
  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 420).lineTo(545, 420).stroke();

  // Computations
  const gross = 0.30 * order.serviceCost;
  const discount = 0.30 * (order.discountAmount || 0);
  const netTotal = Math.max(0, gross - discount);

  let taxableValue, gst;
  if (discount > 0) {
    taxableValue = netTotal / 1.18;
    gst = netTotal - taxableValue;
  } else {
    taxableValue = gross / 1.18;
    gst = gross - taxableValue;
  }

  // Table content
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text('Convenience and Platform Fee', 50, 440);
  doc.fontSize(8).font('Helvetica').fillColor('#6b7280').text('SAC: 999799', 50, 455);

  let currentY = 440;
  doc.fontSize(9).font('Helvetica').fillColor('#4b5563');
  doc.text('Gross Amount', 320, currentY, { align: 'right', width: 100 });
  doc.text(formatCurrency(gross), 445, currentY, { align: 'right', width: 100 });
  currentY += 20;

  doc.text('Discount', 320, currentY, { align: 'right', width: 100 });
  doc.text(`- ${formatCurrency(discount)}`, 445, currentY, { align: 'right', width: 100 });
  currentY += 20;

  doc.font('Helvetica-Bold').text('Taxable Value', 320, currentY, { align: 'right', width: 100 });
  doc.text(formatCurrency(taxableValue), 445, currentY, { align: 'right', width: 100 });
  currentY += 20;

  doc.font('Helvetica').text('IGST @18%', 320, currentY, { align: 'right', width: 100 });
  doc.text(formatCurrency(gst), 445, currentY, { align: 'right', width: 100 });
  currentY += 30;

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, currentY).lineTo(545, currentY).stroke();
  currentY += 10;

  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1f2937').text('TOTAL AMOUNT', 50, currentY);
  doc.text(formatCurrency(netTotal), 445, currentY, { align: 'right', width: 100 });

  // Signature Block at bottom
  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 680).lineTo(545, 680).stroke();
  doc.fontSize(8).font('Helvetica').fillColor('#9ca3af').text('*Reverse Charge mechanism not applicable', 50, 695);
  doc.fontSize(8).font('Helvetica').fillColor('#9ca3af').text('This tax invoice is issued for technology platform facilitation provided by Fixxbuddy.', 50, 710);
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text('Fixxbuddy', 400, 725, { align: 'right', width: 145 });
  doc.fontSize(8).font('Helvetica').fillColor('#6b7280').text('Authorized Signatory', 400, 740, { align: 'right', width: 145 });
}

/**
 * Draws the Partner Service Charge Receipt (70% share)
 */
function drawPartnerReceipt(doc, order, customerName, deliveryAddress, stateCode, invoiceDateStr, partnerName, partnerAddress, partnerGSTIN, logoBuffer) {
  // Brand Header
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, 50, 48, { fit: [110, 20] });
    } catch (err) {
      console.error('Error rendering logo image in PDF, falling back to text:', err);
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#0d9488').text('FIXXBUDDY', 50, 50);
    }
  } else {
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0d9488').text('FIXXBUDDY', 50, 50);
  }
  doc.fontSize(8).font('Helvetica').fillColor('#6b7280').text('R-5, PNR House, Green Park Market, New Delhi, Delhi 110016', 50, 72);

  doc.fontSize(14).font('Helvetica-Bold').fillColor('#1f2937').text('RECEIPT (PARTNER RECEIPT)', 300, 50, { align: 'right', width: 245 });

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 115).lineTo(545, 115).stroke();

  // Columns for info
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text('Customer Name', 50, 130);
  doc.font('Helvetica').fillColor('#4b5563').text(customerName, 50, 145);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Receipt No.', 50, 175);
  doc.font('Helvetica').fillColor('#4b5563').text(`PR-INV-${order.orderId || order._id}`, 50, 190);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Delivery Address', 50, 220);
  doc.font('Helvetica').fillColor('#4b5563').text(deliveryAddress, 50, 235, { width: 220 });

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Receipt Date', 50, 290);
  doc.font('Helvetica').fillColor('#4b5563').text(invoiceDateStr, 50, 305);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('State Name & Code', 50, 335);
  doc.font('Helvetica').fillColor('#4b5563').text(stateCode, 50, 350);

  // Right Column: Delivery Service Provider details (Partner info)
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text('DELIVERY SERVICE PROVIDER', 320, 130);

  doc.font('Helvetica-Bold').text('Business GSTIN', 320, 160);
  doc.font('Helvetica').fillColor('#4b5563').text(partnerGSTIN, 320, 175);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Business Name (Partner)', 320, 205);
  doc.font('Helvetica').fillColor('#4b5563').text(partnerName, 320, 220);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Address', 320, 250);
  doc.font('Helvetica').fillColor('#4b5563').text(partnerAddress, 320, 265, { width: 225 });

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('State Name & Code', 320, 320);
  doc.font('Helvetica').fillColor('#4b5563').text(stateCode, 320, 305);

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 380).lineTo(545, 380).stroke();

  // Table Headers
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text('Items', 50, 400);
  doc.text('Taxable Value', 380, 400, { align: 'right', width: 165 });
  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 420).lineTo(545, 420).stroke();

  // Computations
  const gross = 0.70 * order.serviceCost;
  const discount = 0.70 * (order.discountAmount || 0);
  const netTotal = Math.max(0, gross - discount);

  let taxableValue;
  if (discount > 0) {
    taxableValue = netTotal;
  } else {
    taxableValue = gross;
  }

  // Table content
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text(`Service Charges - ${order.serviceName}`, 50, 440, { width: 260 });
  doc.fontSize(8).font('Helvetica').fillColor('#6b7280').text('SAC: 998715', 50, 470);

  let currentY = 440;
  doc.fontSize(9).font('Helvetica').fillColor('#4b5563');
  doc.text('Gross Amount', 320, currentY, { align: 'right', width: 100 });
  doc.text(formatCurrency(gross), 445, currentY, { align: 'right', width: 100 });
  currentY += 20;

  doc.text('Discount', 320, currentY, { align: 'right', width: 100 });
  doc.text(`- ${formatCurrency(discount)}`, 445, currentY, { align: 'right', width: 100 });
  currentY += 20;

  doc.font('Helvetica-Bold').text('Taxable Value', 320, currentY, { align: 'right', width: 100 });
  doc.text(formatCurrency(taxableValue), 445, currentY, { align: 'right', width: 100 });
  currentY += 30;

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, currentY).lineTo(545, currentY).stroke();
  currentY += 10;

  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1f2937').text('TOTAL AMOUNT', 50, currentY);
  doc.text(formatCurrency(netTotal), 445, currentY, { align: 'right', width: 100 });

  // Disclaimers at bottom
  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 610).lineTo(545, 610).stroke();
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#4b5563').text('Terms & Disclaimers:', 50, 625);

  doc.font('Helvetica-Bold').fillColor('#6b7280').text('Service Provider Liability: ', 50, 640, { continued: true })
    .font('Helvetica').fillColor('#9ca3af').text('This combined receipt is issued on behalf of the independent service professional. Fixxbuddy acts as an intermediary connector.', { width: 495 });

  doc.font('Helvetica-Bold').fillColor('#6b7280').text('Material Price Transparency: ', 50, 665, { continued: true })
    .font('Helvetica').fillColor('#9ca3af').text('Material/spare parts cost reflects monies paid directly to the partner for procurement basis company rate card/instructions.', { width: 495 });
}

/**
 * Draws the Material Receipt on behalf of service professional (100% parts cost)
 */
function drawMaterialReceipt(doc, order, customerName, deliveryAddress, invoiceDateStr, partnerName, partnerAddress, partnerGSTIN, logoBuffer, quotation, additionalCost) {
  // Brand Header
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, 50, 48, { fit: [110, 20] });
    } catch (err) {
      console.error('Error rendering logo image in PDF, falling back to text:', err);
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#0d9488').text('FIXXBUDDY', 50, 50);
    }
  } else {
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0d9488').text('FIXXBUDDY', 50, 50);
  }

  doc.fontSize(14).font('Helvetica-Bold').fillColor('#1f2937').text('PAYMENT RECEIPT (SPARES & MATERIAL)', 250, 50, { align: 'right', width: 295 });

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 115).lineTo(545, 115).stroke();

  // Columns for info
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text('Customer Name', 50, 130);
  doc.font('Helvetica').fillColor('#4b5563').text(customerName, 50, 145);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Receipt No.', 50, 175);
  doc.font('Helvetica').fillColor('#4b5563').text(`MR-INV-${order.orderId || order._id}`, 50, 190);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Delivery Address', 50, 220);
  doc.font('Helvetica').fillColor('#4b5563').text(deliveryAddress, 50, 235, { width: 220 });

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Receipt Date', 50, 290);
  doc.font('Helvetica').fillColor('#4b5563').text(invoiceDateStr, 50, 305);

  // Right Column: Service Provider details (Partner info)
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text('DELIVERY SERVICE PROVIDER', 320, 130);

  doc.font('Helvetica-Bold').text('Business GSTIN', 320, 160);
  doc.font('Helvetica').fillColor('#4b5563').text(partnerGSTIN, 320, 175);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Business Name (Partner)', 320, 205);
  doc.font('Helvetica').fillColor('#4b5563').text(partnerName, 320, 220);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Address', 320, 250);
  doc.font('Helvetica').fillColor('#4b5563').text(partnerAddress, 320, 265, { width: 225 });

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 350).lineTo(545, 350).stroke();

  // Table Headers
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937');
  doc.text('Items', 50, 365);
  doc.text('Qty', 280, 365, { align: 'center', width: 40 });
  doc.text('Price', 330, 365, { align: 'right', width: 80 });
  doc.text('Total Amount', 425, 365, { align: 'right', width: 120 });
  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 385).lineTo(545, 385).stroke();

  let currentY = 395;
  const itemsList = (quotation && quotation.items && quotation.items.length > 0) ? quotation.items : null;
  const materialCost = additionalCost || (order.additionalItemsCost || order.quotationCost || (quotation ? quotation.totalAmount : 0) || 0);

  if (itemsList && itemsList.length > 0) {
    itemsList.forEach(item => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#1f2937').text(item.name || 'Spare / Service Item', 50, currentY, { width: 220 });
      doc.font('Helvetica').fillColor('#4b5563').text(String(item.quantity || 1), 280, currentY, { align: 'center', width: 40 });
      doc.text(formatCurrency(item.price || 0), 330, currentY, { align: 'right', width: 80 });
      doc.text(formatCurrency(item.total || ((item.price || 0) * (item.quantity || 1))), 425, currentY, { align: 'right', width: 120 });
      currentY += 20;
    });
  } else {
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1f2937').text(`Material/Spare Parts Cost - ${order.serviceName}`, 50, currentY, { width: 220 });
    doc.font('Helvetica').fillColor('#4b5563').text('1', 280, currentY, { align: 'center', width: 40 });
    doc.text(formatCurrency(materialCost), 330, currentY, { align: 'right', width: 80 });
    doc.text(formatCurrency(materialCost), 425, currentY, { align: 'right', width: 120 });
    currentY += 20;
  }

  currentY += 10;
  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, currentY).lineTo(545, currentY).stroke();
  currentY += 15;

  doc.fontSize(9).font('Helvetica').fillColor('#4b5563');
  doc.text('Gross Amount', 320, currentY, { align: 'right', width: 100 });
  doc.text(formatCurrency(materialCost), 445, currentY, { align: 'right', width: 100 });
  currentY += 20;

  doc.text('Discount', 320, currentY, { align: 'right', width: 100 });
  doc.text(formatCurrency(0), 445, currentY, { align: 'right', width: 100 });
  currentY += 20;

  doc.font('Helvetica-Bold').text('Taxable Value', 320, currentY, { align: 'right', width: 100 });
  doc.text(formatCurrency(materialCost), 445, currentY, { align: 'right', width: 100 });
  currentY += 25;

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, currentY).lineTo(545, currentY).stroke();
  currentY += 10;

  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1f2937').text('TOTAL AMOUNT', 50, currentY);
  doc.text(formatCurrency(materialCost), 445, currentY, { align: 'right', width: 100 });

  const footerY = Math.max(currentY + 30, 630);
  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, footerY).lineTo(545, footerY).stroke();
  doc.fontSize(8).font('Helvetica').fillColor('#6b7280').text('*This is not an official invoice or tax document. This is a payment receipt for monies paid by you to the professional for purchase of spares/tools/consumables basis your instructions to be used in rendering of services.', 50, footerY + 15, { width: 495 });
  doc.text('*Please request the Service Provider for the original invoice of the materials procured on your behalf - this will be provided if available.', 50, footerY + 40, { width: 495 });
}

module.exports = {
  generateInvoice
};
