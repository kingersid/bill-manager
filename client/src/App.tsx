import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Users, DollarSign, Package, PlusCircle, LayoutDashboard, Send, CheckCircle, 
  FileDown, FileSpreadsheet, Download, Trash2, ShoppingBag, Plus, X, MessageCircle
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import './App.css';

const API_BASE = 'http://localhost:3001/api';

declare module 'jspdf' {
  interface jsPDF { autoTable: (options: any) => jsPDF; }
}

type BillItem = {
  product_name: string;
  pieces: number;
  rate: number;
  total: number;
};

type Bill = {
  id: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string;
  total_amount: number;
  total_pieces: number;
  bill_date: string;
  products: string; // Comma separated list for preview
};

type Stats = {
  total_revenue: number;
  total_pieces_sold: number;
  total_bills: number;
};

function App() {
  const [view, setView] = useState<'dashboard' | 'entry'>('dashboard');
  const [stats, setStats] = useState<Stats | null>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  // Bill Form State
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    phone: '',
    email: '',
    address: ''
  });
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<BillItem[]>([
    { product_name: '', pieces: 0, rate: 0, total: 0 }
  ]);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);

  const shareWhatsApp = (bill: Bill) => {
    if (!bill.customer_phone) {
      alert("No phone number provided for this customer.");
      return;
    }
    let cleanNumber = bill.customer_phone.replace(/\D/g, '');
    if (cleanNumber.length === 10) cleanNumber = "91" + cleanNumber;
    const message = `*INVOICE SUMMARY*%0A--------------------------%0A*Customer:* ${bill.customer_name}%0A*Date:* ${bill.bill_date}%0A*Products:* ${bill.products}%0A*Total Pieces:* ${bill.total_pieces}%0A*Grand Total:* ₹${bill.total_amount.toLocaleString()}%0A--------------------------%0AThank you for shopping with us!`;
    const whatsappUrl = `https://wa.me/${cleanNumber}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  };

  // Calculations
  const grandTotal = useMemo(() => items.reduce((sum, item) => sum + (item.total || 0), 0), [items]);
  const totalPieces = useMemo(() => items.reduce((sum, item) => sum + (Number(item.pieces) || 0), 0), [items]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, trendRes, billsRes] = await Promise.all([
        axios.get(`${API_BASE}/stats`),
        axios.get(`${API_BASE}/sales-trend`),
        axios.get(`${API_BASE}/bills`)
      ]);
      setStats(statsRes.data);
      setTrend(trendRes.data);
      setBills(billsRes.data);
    } catch (error) { console.error('Fetch error:', error); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleItemChange = (index: number, field: keyof BillItem, value: string) => {
    const newItems = [...items];
    const item = newItems[index];
    
    if (field === 'pieces' || field === 'rate') {
      const numValue = parseFloat(value) || 0;
      (item as any)[field] = numValue;
      item.total = item.pieces * item.rate;
    } else {
      (item as any)[field] = value;
    }
    setItems(newItems);
  };

  const addItem = () => setItems([...items, { product_name: '', pieces: 0, rate: 0, total: 0 }]);
  const removeItem = (index: number) => items.length > 1 && setItems(items.filter((_, i) => i !== index));

  const generatePDF = async (bill: Bill) => {
    try {
      const itemsRes = await axios.get(`${API_BASE}/bills/${bill.id}/items`);
      const billItems = itemsRes.data;
      const doc = new jsPDF();
      
      doc.setFontSize(22);
      doc.setTextColor(37, 99, 235);
      doc.text("INVOICE", 105, 20, { align: "center" });
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`Bill ID: #${bill.id} | Date: ${bill.bill_date}`, 105, 30, { align: "center" });

      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text("Bill To:", 20, 50);
      doc.setFont("helvetica", "bold");
      doc.text(bill.customer_name, 20, 57);
      doc.setFont("helvetica", "normal");
      doc.text(`Phone: ${bill.customer_phone || 'N/A'}`, 20, 64);
      doc.text(`Email: ${bill.customer_email || 'N/A'}`, 20, 71);
      doc.text(`Address: ${bill.customer_address || 'N/A'}`, 20, 78);

      doc.autoTable({
        startY: 90,
        head: [['Product Name', 'Pieces', 'Rate (₹)', 'Total (₹)']],
        body: billItems.map((it: any) => [it.product_name, it.pieces, it.rate.toLocaleString(), it.total.toLocaleString()]),
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] },
      });

      const finalY = (doc as any).lastAutoTable.finalY;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`Grand Total: ₹${bill.total_amount.toLocaleString()}`, 190, finalY + 20, { align: "right" });
      doc.save(`Invoice_${bill.id}.pdf`);
    } catch (err) { console.error('PDF error:', err); }
  };

  const deleteBill = async (id: number) => {
    if (!window.confirm('Delete this bill forever?')) return;
    try {
      await axios.delete(`${API_BASE}/bills/${id}`);
      fetchData();
    } catch (err) { console.error('Delete fail:', err); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus('Saving...');
    try {
      await axios.post(`${API_BASE}/bills`, {
        customer_name: customerInfo.name,
        customer_phone: customerInfo.phone,
        customer_email: customerInfo.email,
        customer_address: customerInfo.address,
        bill_date: billDate,
        items,
        grand_total: grandTotal,
        total_pieces: totalPieces
      });
      setSubmitStatus('Saved Successfully!');
      setCustomerInfo({ name: '', phone: '', email: '', address: '' });
      setItems([{ product_name: '', pieces: 0, rate: 0, total: 0 }]);
      fetchData();
      setTimeout(() => setSubmitStatus(null), 3000);
    } catch (err) { setSubmitStatus('Save Error'); }
  };

  return (
    <div className="app-container">
      <nav className="nav">
        <button className={`nav-btn ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
          <LayoutDashboard size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          Sales Dashboard
        </button>
        <button className={`nav-btn ${view === 'entry' ? 'active' : ''}`} onClick={() => setView('entry')}>
          <PlusCircle size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          New Bill Entry
        </button>
      </nav>

      {view === 'dashboard' ? (
        <div className="dashboard-view">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label"><DollarSign size={16} /> Total Revenue</div>
              <div className="stat-value">₹{stats?.total_revenue?.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><Package size={16} /> Pieces Sold</div>
              <div className="stat-value">{stats?.total_pieces_sold}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><Users size={16} /> Total Orders</div>
              <div className="stat-value">{stats?.total_bills}</div>
            </div>
          </div>

          <div className="recent-bills">
            <h3>Recent Transactions</h3>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Products</th>
                  <th>Pieces</th>
                  <th>Grand Total</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map(bill => (
                  <tr key={bill.id}>
                    <td>{bill.bill_date}</td>
                    <td>{bill.customer_name}</td>
                    <td style={{ fontSize: '0.85rem', color: '#64748b' }}>{bill.products}</td>
                    <td>{bill.total_pieces}</td>
                    <td>₹{bill.total_amount.toLocaleString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => shareWhatsApp(bill)} style={{ color: '#25d366', background: 'none', border: 'none', cursor: 'pointer' }}><MessageCircle size={18} /></button>
                        <button onClick={() => generatePDF(bill)} style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}><FileDown size={18} /></button>
                        <button onClick={() => deleteBill(bill.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="form-card" style={{ maxWidth: '900px' }}>
          <h2 style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem' }}><Send color="var(--primary)" /> New Multi-Item Bill</h2>
          
          <form onSubmit={handleSubmit}>
            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '0.5rem', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
              <h4 style={{ marginBottom: '1rem', color: '#475569' }}>Customer Information</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input type="text" className="form-input" required value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input type="text" className="form-input" value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input type="email" className="form-input" value={customerInfo.email} onChange={e => setCustomerInfo({...customerInfo, email: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Billing Date</label>
                  <input type="date" className="form-input" value={billDate} onChange={e => setBillDate(e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: '0.5rem' }}>
                <label className="form-label">Full Address</label>
                <input type="text" className="form-input" value={customerInfo.address} onChange={e => setCustomerInfo({...customerInfo, address: e.target.value})} />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h4 style={{ color: '#475569' }}>Product Details</h4>
                <button type="button" onClick={addItem} style={{ background: 'var(--success)', padding: '0.25rem 0.75rem', fontSize: '0.85rem' }} className="submit-btn"><Plus size={14} /> Add Item</button>
              </div>
              
              <table style={{ background: 'transparent' }}>
                <thead>
                  <tr>
                    <th style={{ background: 'none' }}>Product Name</th>
                    <th style={{ background: 'none', width: '100px' }}>Pieces</th>
                    <th style={{ background: 'none', width: '120px' }}>Rate (₹)</th>
                    <th style={{ background: 'none', width: '120px' }}>Total (₹)</th>
                    <th style={{ background: 'none', width: '50px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={index}>
                      <td><input type="text" className="form-input" required value={item.product_name} onChange={e => handleItemChange(index, 'product_name', e.target.value)} placeholder="e.g. Silk Saree" /></td>
                      <td><input type="number" className="form-input" required value={item.pieces} onChange={e => handleItemChange(index, 'pieces', e.target.value)} /></td>
                      <td><input type="number" className="form-input" required value={item.rate} onChange={e => handleItemChange(index, 'rate', e.target.value)} /></td>
                      <td style={{ fontWeight: 'bold' }}>₹{item.total.toLocaleString()}</td>
                      <td>{items.length > 1 && <button type="button" onClick={() => removeItem(index)} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}><X size={18} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ textAlign: 'right', minWidth: '200px' }}>
                <div style={{ color: '#64748b', fontSize: '0.9rem' }}>Total Pieces: {totalPieces}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)', marginTop: '0.25rem' }}>Grand Total: ₹{grandTotal.toLocaleString()}</div>
                <button type="submit" className="submit-btn" disabled={loading} style={{ marginTop: '1rem' }}>
                  {submitStatus || 'Create Final Bill'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
