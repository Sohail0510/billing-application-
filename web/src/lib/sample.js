// Sample business data for trying the app. Every name here is made up.
import { gstinCheckChar, computeVoucher } from './gst.js';
import { addDays, todayISO, uid } from './format.js';

const gstin = (state, pan) => {
  const first = `${state}${pan}1Z`;
  return first + gstinCheckChar(first);
};

export function buildSampleData(existingSettings) {
  const today = todayISO();
  const settings = JSON.parse(JSON.stringify(existingSettings));
  settings.business = {
    ...settings.business,
    name: 'SAMPLE COOLING CENTRE', address: '8-3-214, Main Road, Ameerpet', city: 'Hyderabad', state: '36', pincode: '500016',
    gstin: gstin('36', 'ABCPS1234K'), pan: 'ABCPS1234K', phone: '9000000001', email: '',
    bankName: 'State Bank of India', branch: 'Ameerpet', accountName: 'Sample Cooling Centre', accountNo: '00000012345678', ifsc: 'SBIN0000001', upi: 'samplecooling@upi',
  };
  settings.onboarded = true;
  settings.sample = true;

  const P = (name, extra) => ({ id: uid(), name, kind: 'customer', phone: '', email: '', gstin: '', pan: '', state: '36', billingAddress: '', shippingAddress: '', openingBalance: 0, openingType: 'receive', ...extra });
  const parties = [
    P('RAVI HOME APPLIANCES', { gstin: gstin('36', 'AFKPR5521M'), pan: 'AFKPR5521M', phone: '9000000011', billingAddress: '2-1-45, Nallakunta, Hyderabad, Telangana, 500044' }),
    P('LAKSHMI TRADERS', { gstin: gstin('36', 'AAHFL8890Q'), pan: 'AAHFL8890Q', phone: '9000000012', billingAddress: '5-9-22, Abids Road, Hyderabad, Telangana, 500001', openingBalance: 12000 }),
    P('Suresh Kumar', { phone: '9000000013', billingAddress: 'Flat 302, Green Residency, Kukatpally, Hyderabad' }),
    P('GODAVARI ELECTRICALS', { gstin: gstin('37', 'AAGFG4410L'), pan: 'AAGFG4410L', state: '37', phone: '9000000014', billingAddress: 'D.No 12-4-9, Main Bazar, Vijayawada, Andhra Pradesh, 520001' }),
    P('COOLAIR DISTRIBUTORS', { kind: 'supplier', gstin: gstin('29', 'AACCC7781H'), pan: 'AACCC7781H', state: '29', phone: '9000000021', billingAddress: '14, Lalbagh Road, Bengaluru, Karnataka, 560027' }),
    P('STAR COOLING AGENCIES', { kind: 'supplier', gstin: gstin('36', 'AAEFS3302B'), pan: 'AAEFS3302B', phone: '9000000022', billingAddress: '1-8-303, Secunderabad, Telangana, 500003', openingBalance: 8500, openingType: 'pay' }),
  ];
  const I = (name, extra) => ({ id: uid(), name, kind: 'product', hsn: '8415', unit: 'PCS', salePrice: 0, saleTaxIncl: true, purchasePrice: 0, purchaseTaxIncl: false, gstRate: 18, openingStock: 0, lowStock: 2, description: '', ...extra });
  const items = [
    I('LG 1.5 TON 5 STAR AC', { salePrice: 34000, purchasePrice: 25500, openingStock: 4 }),
    I('DAIKIN 1.5 TON 3 STAR AC', { salePrice: 29500, purchasePrice: 21800, openingStock: 6 }),
    I('VOLTAS 1 TON 3 STAR AC', { salePrice: 26990, purchasePrice: 19900, openingStock: 3 }),
    I('SAMSUNG 253L REFRIGERATOR', { hsn: '8418', salePrice: 24500, purchasePrice: 18200, openingStock: 5 }),
    I('V-GUARD AC STABILIZER', { hsn: '8504', salePrice: 2600, purchasePrice: 1650, openingStock: 12, lowStock: 4 }),
    I('COPPER PIPE (PER MTR)', { hsn: '7411', unit: 'MTR', salePrice: 650, purchasePrice: 420, openingStock: 60, lowStock: 15 }),
    I('AC INSTALLATION', { kind: 'service', hsn: '9987', unit: 'JOB', salePrice: 1500, saleTaxIncl: true, openingStock: 0, lowStock: 0 }),
  ];
  const [ravi, lakshmi, suresh, godavari, coolair, star] = parties;
  const [lg, daikin, voltas, fridge, stab, pipe, install] = items;
  const line = (it, qty, over = {}) => ({
    itemId: it.id, name: it.name, hsn: it.hsn, unit: it.unit, qty, price: it.salePrice, taxIncl: it.saleTaxIncl, gstRate: it.gstRate, discountPct: 0, ...over,
  });
  const pline = (it, qty) => line(it, qty, { price: it.purchasePrice, taxIncl: it.purchaseTaxIncl });
  const snap = (p) => ({ name: p.name, gstin: p.gstin, pan: p.pan, phone: p.phone, state: p.state, billingAddress: p.billingAddress, shippingAddress: p.shippingAddress });
  const vouchers = [];
  const V = (kind, number, seq, daysAgo, party, lines, extra = {}) => {
    const date = addDays(today, -daysAgo);
    const v = {
      id: uid(), kind, number, seq, date, dueDate: kind === 'cnote' || kind === 'dnote' ? '' : addDays(date, 7),
      partyId: party ? party.id : '', party: party ? snap(party) : null, taxState: party ? party.state : '36', bizState: '36',
      lines, roundOff: true, settled: 0, paymentMode: 'Cash', notes: '', createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(), ...extra,
    };
    vouchers.push(v);
    return v;
  };
  const total = (v) => computeVoucher(v, '36').total;

  V('purchase', 'CA/2291', 1, 40, coolair, [pline(lg, 4), pline(daikin, 4)], { settled: 0 });
  V('purchase', 'SCA-118', 2, 30, star, [pline(stab, 10), pline(pipe, 40)]);
  const s1 = V('sale', '101', 101, 28, ravi, [line(lg, 2), line(stab, 2)]);
  s1.settled = total(s1);
  s1.paymentMode = 'Bank Transfer';
  V('sale', '102', 102, 21, lakshmi, [line(daikin, 3, { discountPct: 2 }), line(pipe, 12)]);
  const s3 = V('sale', '103', 103, 16, suresh, [line(voltas, 1), line(install, 1), line(pipe, 4)]);
  s3.settled = total(s3);
  s3.paymentMode = 'UPI';
  V('sale', '104', 104, 12, godavari, [line(fridge, 2), line(lg, 1)]);
  V('quote', 'QT-1', 1, 6, ravi, [line(daikin, 5), line(install, 5)], { status: 'open' });
  V('sale', '105', 105, 4, ravi, [line(lg, 1), line(install, 1)]);
  V('cnote', 'CN-1', 1, 3, lakshmi, [line(pipe, 2)], { refNumber: '102' });
  const s6 = V('sale', '106', 106, 1, null, [line(stab, 1)], { taxState: '36' });
  s6.settled = total(s6);
  V('purchase', 'CA/2410', 3, 2, coolair, [pline(voltas, 3), pline(fridge, 2)]);

  const pay = (direction, number, seq, daysAgo, party, amount, mode) => ({
    id: uid(), direction, number, seq, date: addDays(today, -daysAgo), partyId: party.id, amount, mode, reference: '', notes: '',
    createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
  });
  const payments = [
    pay('in', 'PI-1', 1, 14, lakshmi, 50000, 'Bank Transfer'),
    pay('in', 'PI-2', 2, 5, godavari, 40000, 'Cheque'),
    pay('out', 'PO-1', 1, 20, coolair, 150000, 'Bank Transfer'),
    pay('out', 'PO-2', 2, 8, star, 8500, 'Cash'),
  ];
  const exp = (number, seq, daysAgo, category, amount, extra = {}) => ({
    id: uid(), number, seq, date: addDays(today, -daysAgo), category, amount, paymentMode: 'Cash', paidTo: '', notes: '', gstRate: 0,
    createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(), ...extra,
  });
  const expenses = [
    exp('EXP-1', 1, 25, 'Rent', 25000, { paymentMode: 'Bank Transfer', paidTo: 'Shop owner' }),
    exp('EXP-2', 2, 18, 'Transport', 1800, { paidTo: 'Auto delivery' }),
    exp('EXP-3', 3, 10, 'Electricity', 4200, { paymentMode: 'UPI' }),
    exp('EXP-4', 4, 3, 'Repairs', 2360, { gstRate: 18, paidTo: 'Tools & Spares', paymentMode: 'UPI' }),
  ];
  return { settings, parties, items, vouchers, payments, expenses };
}
