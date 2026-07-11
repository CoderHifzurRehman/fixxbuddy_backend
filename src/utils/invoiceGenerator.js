const PDFDocument = require('pdfkit');

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
function generateInvoice(order) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  // Extracted details
  const customerName = order.userId ? `${order.userId.firstName || ''} ${order.userId.lastName || ''}`.trim() : 'Customer';
  const deliveryAddress = order.deliveryAddress 
    ? `${order.deliveryAddress.street || ''}, ${order.deliveryAddress.city || ''}, ${order.deliveryAddress.state || ''} - ${order.deliveryAddress.postalCode || ''}`.trim()
    : 'No delivery address provided';
  const stateCode = order.deliveryAddress ? `${order.deliveryAddress.state || ''}`.trim() : 'N/A';
  const contactNumber = order.contactNumber ? order.contactNumber.number : 'N/A';
  
  const partnerName = order.assignedPartner ? `${order.assignedPartner.firstName || ''} ${order.assignedPartner.lastName || ''}`.trim() : 'Partner';
  const partnerContact = order.assignedPartner ? order.assignedPartner.contactNumber : 'N/A';
  const partnerAddress = order.assignedPartner && order.assignedPartner.address 
    ? `${order.assignedPartner.address.street || ''}, ${order.assignedPartner.address.city || ''}, ${order.assignedPartner.address.state || ''} - ${order.assignedPartner.address.pincode || ''}`.trim()
    : 'Partner Address';
  
  const invoiceDateStr = order.completedAt 
    ? new Date(order.completedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  // ----------------------------------------------------
  // PAGE 1: Fixxbuddy Platform & Convenience Fee (30% share)
  // ----------------------------------------------------
  drawFixxbuddyInvoice(doc, order, customerName, deliveryAddress, stateCode, invoiceDateStr);

  // ----------------------------------------------------
  // PAGE 2: Partner Service Charge Receipt (70% share)
  // ----------------------------------------------------
  doc.addPage();
  drawPartnerReceipt(doc, order, customerName, deliveryAddress, stateCode, invoiceDateStr, partnerName, partnerAddress);

  // ----------------------------------------------------
  // PAGE 3: Material Cost (if any)
  // ----------------------------------------------------
  if (order.additionalItemsCost && order.additionalItemsCost > 0) {
    doc.addPage();
    drawMaterialReceipt(doc, order, customerName, deliveryAddress, invoiceDateStr, partnerName, partnerAddress);
  }

  doc.end();
  return doc;
}

/**
 * Draws the Fixxbuddy Invoice (Platform and Convenience Fee)
 */
function drawFixxbuddyInvoice(doc, order, customerName, deliveryAddress, stateCode, invoiceDateStr) {
  // Brand Header
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#0d9488').text('FIXXBUDDY', 50, 50);
  doc.fontSize(8).font('Helvetica').fillColor('#6b7280').text('Fixxbuddy Technologies Private Limited', 50, 72);
  doc.text('Plot No. 45, Sector 18, Udyog Vihar, Gurugram, Haryana - 122015', 50, 84);
  doc.text('GSTIN: 06AAKCF9988D1ZP', 50, 96);

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
  doc.font('Helvetica').fillColor('#4b5563').text('06AAKCF9988D1ZP', 320, 175);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Business Name', 320, 205);
  doc.font('Helvetica').fillColor('#4b5563').text('Fixxbuddy Technologies India Pvt. Ltd.', 320, 220);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Address', 320, 250);
  doc.font('Helvetica').fillColor('#4b5563').text('Plot No. 45, Sector 18, Udyog Vihar, Gurugram, Haryana - 122015', 320, 265, { width: 225 });

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('State Name & Code', 320, 320);
  doc.font('Helvetica').fillColor('#4b5563').text('Haryana 06', 320, 335);

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 380).lineTo(545, 380).stroke();

  // Table Headers
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text('Items', 50, 400);
  doc.text('Taxable Value', 380, 400, { align: 'right', width: 165 });
  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 420).lineTo(545, 420).stroke();

  // Computations
  const gross = 0.30 * order.serviceCost;
  const discount = 0.30 * (order.discountAmount || 0);
  const netTotal = Math.max(0, gross - discount);
  const taxableValue = netTotal / 1.18;
  const gst = netTotal - taxableValue;

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
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text('Fixxbuddy Technologies', 400, 695, { align: 'right', width: 145 });
  doc.fontSize(8).font('Helvetica').fillColor('#6b7280').text('Authorized Signatory', 400, 710, { align: 'right', width: 145 });
}

/**
 * Draws the Partner Service Charge Receipt (70% share)
 */
function drawPartnerReceipt(doc, order, customerName, deliveryAddress, stateCode, invoiceDateStr, partnerName, partnerAddress) {
  // Brand Header
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#0d9488').text('FIXXBUDDY', 50, 50);
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
  
  doc.font('Helvetica-Bold').text('Business Name (Partner)', 320, 160);
  doc.font('Helvetica').fillColor('#4b5563').text(partnerName, 320, 175);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Address', 320, 205);
  doc.font('Helvetica').fillColor('#4b5563').text(partnerAddress, 320, 220, { width: 225 });

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('State Name & Code', 320, 290);
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
  doc.text(formatCurrency(netTotal), 445, currentY, { align: 'right', width: 100 });
  currentY += 30;

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, currentY).lineTo(545, currentY).stroke();
  currentY += 10;

  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1f2937').text('TOTAL AMOUNT', 50, currentY);
  doc.text(formatCurrency(netTotal), 445, currentY, { align: 'right', width: 100 });
}

/**
 * Draws the Material Receipt on behalf of service professional (100% parts cost)
 */
function drawMaterialReceipt(doc, order, customerName, deliveryAddress, invoiceDateStr, partnerName, partnerAddress) {
  // Brand Header
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#0d9488').text('FIXXBUDDY', 50, 50);
  
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
  
  doc.font('Helvetica-Bold').text('Business Name (Partner)', 320, 160);
  doc.font('Helvetica').fillColor('#4b5563').text(partnerName, 320, 175);

  doc.font('Helvetica-Bold').fillColor('#1f2937').text('Address', 320, 205);
  doc.font('Helvetica').fillColor('#4b5563').text(partnerAddress, 320, 220, { width: 225 });

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 350).lineTo(545, 350).stroke();

  // Table Headers
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text('Items', 50, 370);
  doc.text('Taxable Value', 380, 370, { align: 'right', width: 165 });
  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 390).lineTo(545, 390).stroke();

  // Computations
  const materialCost = order.additionalItemsCost;

  // Table content
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937').text(`Material/Spare Parts Cost - ${order.serviceName}`, 50, 410, { width: 260 });

  let currentY = 410;
  doc.fontSize(9).font('Helvetica').fillColor('#4b5563');
  doc.text('Gross Amount', 320, currentY, { align: 'right', width: 100 });
  doc.text(formatCurrency(materialCost), 445, currentY, { align: 'right', width: 100 });
  currentY += 20;

  doc.text('Discount', 320, currentY, { align: 'right', width: 100 });
  doc.text(formatCurrency(0), 445, currentY, { align: 'right', width: 100 });
  currentY += 20;

  doc.font('Helvetica-Bold').text('Taxable Value', 320, currentY, { align: 'right', width: 100 });
  doc.text(formatCurrency(materialCost), 445, currentY, { align: 'right', width: 100 });
  currentY += 30;

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, currentY).lineTo(545, currentY).stroke();
  currentY += 10;

  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1f2937').text('TOTAL AMOUNT', 50, currentY);
  doc.text(formatCurrency(materialCost), 445, currentY, { align: 'right', width: 100 });

  // Notes
  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, 640).lineTo(545, 640).stroke();
  doc.fontSize(8).font('Helvetica').fillColor('#6b7280').text('*This is not an official invoice or tax document. This is a payment receipt for monies paid by you to the professional for purchase of spares/tools/consumables basis your instructions to be used in rendering of services.', 50, 655, { width: 495 });
  doc.text('*Please request the Service Provider for the original invoice of the materials procured on your behalf - this will be provided if available.', 50, 680, { width: 495 });
}

module.exports = {
  generateInvoice
};
