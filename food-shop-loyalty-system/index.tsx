
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import * as LucideIcons from 'lucide-react';
import * as QRCodeModule from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';

// Extract icons safely from the namespaced import
const { 
  Store, User, QrCode, Scan, History, Gift, Plus, CheckCircle, 
  TrendingUp, Calendar, ChefHat, ShoppingBag, Hotel, Trash2, 
  ChevronLeft, ChevronRight, Info, Search, Filter, SortAsc, LayoutGrid,
  ShieldCheck, ShieldAlert, FileText, Settings, Shield, Mail, Download, X,
  AlertCircle, ArrowRight, LogOut, UserPlus, UserCircle, Sparkles, Key, Lock,
  Keyboard, Check, Clock
} = LucideIcons;

// Defensive import for QRCodeSVG to handle various ESM wrapping styles
const QRCodeSVG = (QRCodeModule as any).QRCodeSVG || (QRCodeModule as any).default?.QRCodeSVG || (QRCodeModule as any).default;

// --- Types ---
type ShopType = 'fast-food' | 'hotel' | 'retail';
type VerificationStatus = 'unverified' | 'pending' | 'verified';
type UserRole = 'customer' | 'owner' | 'admin';

interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface Shop {
  id: string;
  name: string;
  type: ShopType;
  ownerId: string;
  ownerEmail?: string;
  verificationStatus: VerificationStatus;
  licenseNumber?: string;
  secretCode: string; // Secret code to verify visit
}

interface ScanRecord {
  id: string;
  shopId: string;
  customerId: string;
  timestamp: number;
  transactionId: string;
}

// --- Mock Initial Data & LocalStorage Helpers ---
const STORAGE_KEYS = {
  SHOPS: 'loyalty_shops',
  SCANS: 'loyalty_scans',
  USERS: 'loyalty_users',
  LOGGED_IN_USER_ID: 'loyalty_logged_in_uid'
};

// --- Helper Functions ---
const downloadQRCodeAsPng = (shopId: string, shopName: string) => {
  const svg = document.getElementById(`qr-svg-${shopId}`);
  if (!svg) return;

  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  
  const size = 512;
  canvas.width = size;
  canvas.height = size;

  img.onload = () => {
    if (!ctx) return;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, size, size);
    
    const pngFile = canvas.toDataURL("image/png");
    const downloadLink = document.createElement("a");
    downloadLink.download = `${shopName.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
    downloadLink.href = pngFile;
    downloadLink.click();
  };

  img.src = "data:image/svg+xml;base64," + btoa(svgData);
};

// --- Sub-Components ---

const ScanConfirmationModal = ({ shop, onConfirm, onCancel, alreadyVisitedOn }: { shop: Shop, onConfirm: (tId: string, date: string) => void, onCancel: () => void, alreadyVisitedOn: (date: string) => boolean }) => {
  const [tId, setTId] = useState('');
  const [typedCode, setTypedCode] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');

  const isAlreadyVisited = alreadyVisitedOn(new Date(visitDate).toDateString());

  const handleComplete = () => {
    if (typedCode !== shop.secretCode) {
      setError('Invalid Secret Code. Please ask the shop for the correct code.');
      return;
    }
    if (isAlreadyVisited) {
      setError('A visit is already recorded for this shop on this date.');
      return;
    }
    onConfirm(tId, visitDate);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${isAlreadyVisited ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
            {isAlreadyVisited ? <AlertCircle size={40} /> : <Store size={40} />}
          </div>
          
          <h3 className="text-2xl font-bold text-slate-900 mb-2">
            {isAlreadyVisited ? 'Already Visited' : `Welcome to ${shop.name}`}
          </h3>
          
          <p className="text-slate-500 mb-8 px-4 text-sm">
            {isAlreadyVisited 
              ? `You've already recorded a visit here on ${new Date(visitDate).toLocaleDateString()}. One visit per day per shop counts.`
              : "Great to see you! Please enter the secret code provided at the counter to confirm your visit."}
          </p>

          <div className="space-y-4 mb-8 text-left">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2 px-1">Visit Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="date"
                  value={visitDate}
                  onChange={(e) => { setVisitDate(e.target.value); setError(''); }}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition"
                />
              </div>
            </div>

            {!isAlreadyVisited && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2 px-1">Verification Code</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text"
                      value={typedCode}
                      onChange={(e) => { setTypedCode(e.target.value); setError(''); }}
                      placeholder="Enter Shop Secret Code"
                      className={`w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 outline-none transition ${error ? 'border-red-500 focus:ring-red-200' : 'border-slate-200 focus:ring-orange-500'}`}
                    />
                  </div>
                  {error && <p className="text-red-500 text-xs mt-1 px-1 font-medium">{error}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2 px-1">Transaction ID (Optional)</label>
                  <input 
                    type="text"
                    value={tId}
                    onChange={(e) => setTId(e.target.value)}
                    placeholder="e.g. #12345"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {!isAlreadyVisited && (
              <button 
                onClick={handleComplete}
                className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 transition shadow-lg shadow-green-100 flex items-center justify-center gap-2"
              >
                Complete Visit <CheckCircle size={20} />
              </button>
            )}
            <button 
              onClick={onCancel}
              className="w-full text-slate-500 font-bold py-3 hover:text-slate-800 transition"
            >
              {isAlreadyVisited ? 'Close' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const RegistrationView = ({ regRole, setRegRole, regName, setRegName, regEmail, setRegEmail, handleRegister }: any) => (
  <div className="max-w-md mx-auto py-12 animate-in slide-in-from-bottom-8 duration-700">
    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
      <div className="bg-slate-900 p-8 text-center text-white">
        <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <UserPlus size={32} />
        </div>
        <h2 className="text-2xl font-bold">Create Account</h2>
        <p className="text-slate-400 text-sm mt-1">Join the loyalty network today</p>
      </div>
      
      <form onSubmit={handleRegister} className="p-8 space-y-6">
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button 
            type="button"
            onClick={() => setRegRole('customer')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${regRole === 'customer' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
          >
            Customer
          </button>
          <button 
            type="button"
            onClick={() => setRegRole('owner')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${regRole === 'owner' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
          >
            Shop Owner
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                required
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="John Doe"
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="email" 
                required
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="john@example.com"
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition"
              />
            </div>
          </div>
        </div>

        <button 
          type="submit"
          className="w-full bg-orange-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-orange-600 transition shadow-lg shadow-orange-100 flex items-center justify-center gap-2"
        >
          Sign Up Now <ArrowRight size={20} />
        </button>
        
        <p className="text-center text-xs text-slate-400 italic">
          {regRole === 'customer' 
            ? "Start earning rewards at your favorite local stalls." 
            : "Increase your sales by rewarding your regular customers."}
        </p>
      </form>
    </div>
  </div>
);

const RegistrationSuccessModal = ({ shop, onClose }: { shop: Shop, onClose: () => void }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
    <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-300">
      <div className="bg-gradient-to-r from-orange-500 to-red-600 p-8 text-center relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white">
          <X size={24} />
        </button>
        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 text-white border-2 border-white/30">
          <Mail size={32} />
        </div>
        <h3 className="text-2xl font-bold text-white mb-2">Welcome Email Sent!</h3>
        <p className="text-white/80 text-sm">We've sent your unique shop QR code to <strong>{shop.ownerEmail}</strong></p>
      </div>
      <div className="p-8 text-center">
        <p className="text-slate-600 mb-6 font-medium">Your Loyalty Program is now live for <strong>{shop.name}</strong>!</p>
        
        <div className="bg-orange-50 p-4 rounded-2xl mb-4 inline-block">
          <p className="text-xs font-bold text-orange-600 uppercase mb-1">Secret Verification Code</p>
          <p className="text-3xl font-black text-slate-900 tracking-widest">{shop.secretCode}</p>
        </div>

        <div className="bg-slate-100 p-4 rounded-2xl mb-6">
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Manual Entry Code (Share with Customers)</p>
          <p className="font-mono text-sm select-all">{shop.id}</p>
        </div>

        <div className="inline-block p-6 bg-slate-50 rounded-3xl border-2 border-slate-100 shadow-inner mb-6">
          {QRCodeSVG && <QRCodeSVG id={`qr-svg-${shop.id}`} value={`loyalty_scan:${shop.id}`} size={160} />}
        </div>
        
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => downloadQRCodeAsPng(shop.id, shop.name)} 
            className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition"
          >
            <Download size={20} /> Download QR Code (PNG)
          </button>
          <button 
            onClick={onClose} 
            className="w-full text-slate-500 font-bold py-2 hover:text-slate-900"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  </div>
);

const HomeView = ({ currentUser, setIsRegistering, setRegRole }: any) => (
  <div className="space-y-8 animate-in fade-in duration-500">
    <header className="text-center py-10 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-3xl shadow-xl px-4">
      <h1 className="text-4xl font-bold mb-4">LoyaltyRewards</h1>
      <p className="text-lg opacity-90 max-w-xl mx-auto">
        Reward your regulars. Grow your business. The simplest QR-based loyalty system for local shops.
      </p>
      {!currentUser && (
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <button 
            onClick={() => { setRegRole('customer'); setIsRegistering(true); }}
            className="bg-white text-orange-600 px-6 py-3 rounded-full font-semibold shadow-md hover:bg-orange-50 transition"
          >
            Join as Customer
          </button>
          <button 
            onClick={() => { setRegRole('owner'); setIsRegistering(true); }}
            className="bg-orange-700 text-white px-6 py-3 rounded-full font-semibold shadow-md hover:bg-orange-800 transition"
          >
            Register your Shop
          </button>
        </div>
      )}
    </header>

    <section className="grid md:grid-cols-3 gap-6">
      {[
        { icon: <ChefHat className="text-orange-500" />, title: 'Fast Food', desc: 'Build lunch crowds with "6 Visits = 1 Free Meal"' },
        { icon: <Hotel className="text-blue-500" />, title: 'Hotels', desc: 'Encourage business stays with loyalty discounts' },
        { icon: <ShoppingBag className="text-green-500" />, title: 'Retail', desc: 'Perfect for coffee shops, bakeries, and boutiques' },
      ].map((item, idx) => (
        <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition">
          <div className="mb-4">{item.icon}</div>
          <h3 className="text-xl font-bold mb-2">{item.title}</h3>
          <p className="text-slate-600">{item.desc}</p>
        </div>
      ))}
    </section>

    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Info className="text-orange-500" /> Trust and Legitimacy
      </h2>
      <div className="bg-slate-50 p-6 rounded-2xl flex items-start gap-4">
        <div className="bg-white p-3 rounded-full text-blue-500 shadow-sm">
          <ShieldCheck size={32} />
        </div>
        <div>
          <h4 className="font-bold text-lg mb-1">Shop Verification System</h4>
          <p className="text-slate-600">
            Shops can apply for a verification badge. Customers feel safer shopping at verified outlets, ensuring higher retention and brand trust. Look for the blue checkmark!
          </p>
        </div>
      </div>
    </div>
  </div>
);

const ShopDashboard = ({ 
  currentUser, shops, scans, setActiveTab, setIsRegistering, isRegistering, 
  newShopName, setNewShopName, newShopEmail, setNewShopEmail, newShopType, setNewShopType, 
  newShopSecretCode, setNewShopSecretCode,
  addShop, verifyingShopId, setVerifyingShopId, licenseNumber, setLicenseNumber, 
  submitVerification, unverifiedShops, searchTerm, setSearchTerm, sortBy, setSortBy, 
  filteredShops, shopCounts, filterType, setFilterType, handleManualScan, getRewardEligibility 
}: any) => {
  const hasShopsAtAll = useMemo(() => {
    return shops.some((s: Shop) => s.ownerId === currentUser?.id);
  }, [shops, currentUser]);

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Your Shops</h2>
          <p className="text-sm text-slate-500">Manage your business and track customer loyalty</p>
        </div>
        <div className="flex gap-2">
          {currentUser?.role === 'admin' && (
            <button 
              onClick={() => setActiveTab('admin')}
              className="bg-slate-100 text-slate-600 px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-slate-200 transition"
            >
              <Shield size={20} /> System Review
            </button>
          )}
          <button 
            onClick={() => setIsRegistering(true)}
            className="bg-orange-500 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-orange-600 transition shadow-lg shadow-orange-100"
          >
            <Plus size={20} /> Register New Shop
          </button>
        </div>
      </div>

      {unverifiedShops.length > 0 && !verifyingShopId && (
        <div className="bg-blue-600 text-white p-6 rounded-3xl shadow-xl shadow-blue-100 flex flex-col md:flex-row items-center justify-between gap-6 animate-in slide-in-from-top-4">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl">
              <ShieldAlert size={32} className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Complete Your Profile</h3>
              <p className="text-blue-100 text-sm">You have {unverifiedShops.length} unverified shop{unverifiedShops.length > 1 ? 's' : ''}. Get verified to build customer trust.</p>
            </div>
          </div>
          <button 
            onClick={() => setVerifyingShopId(unverifiedShops[0].id)}
            className="bg-white text-blue-600 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-50 transition active:scale-95 shrink-0"
          >
            Start Verification <ArrowRight size={18} />
          </button>
        </div>
      )}

      {isRegistering && (
        <div className="bg-white p-6 rounded-2xl border-2 border-orange-500 shadow-lg animate-in zoom-in-95">
          <h3 className="text-xl font-bold mb-4">Register Shop</h3>
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Shop Name</label>
                <input 
                  type="text" 
                  value={newShopName}
                  onChange={(e) => setNewShopName(e.target.value)}
                  placeholder="e.g. Sunny's Pizza"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Owner Email (For Welcome Kit)</label>
                <input 
                  type="email" 
                  value={newShopEmail}
                  onChange={(e) => setNewShopEmail(e.target.value)}
                  placeholder="owner@example.com"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Shop Category</label>
                <select 
                  value={newShopType}
                  onChange={(e) => setNewShopType(e.target.value as ShopType)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="fast-food">Fast Food Stall</option>
                  <option value="hotel">Hotel / Lodge</option>
                  <option value="retail">Retail Shop</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Secret Verification Code</label>
                <input 
                  type="text" 
                  value={newShopSecretCode}
                  onChange={(e) => setNewShopSecretCode(e.target.value)}
                  placeholder="e.g. 1234"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addShop} className="bg-orange-500 text-white px-6 py-2 rounded-lg font-bold">Save Shop & Send Email</button>
              <button onClick={() => setIsRegistering(false)} className="bg-slate-100 text-slate-600 px-6 py-2 rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {verifyingShopId && (
        <div className="bg-white p-8 rounded-3xl border-2 border-blue-600 shadow-2xl animate-in zoom-in-95 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <ShieldCheck size={160} />
          </div>
          <div className="flex items-center gap-3 mb-6 relative">
            <div className="p-3 bg-blue-100 rounded-2xl text-blue-600">
              <FileText size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-bold">Shop Verification</h3>
              <p className="text-slate-500 text-sm">Submit your details for <strong>{shops.find((s: any) => s.id === verifyingShopId)?.name}</strong></p>
            </div>
          </div>
          
          <div className="space-y-6 relative max-w-lg">
            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex gap-3">
              <Info className="text-blue-500 shrink-0" size={18} />
              <p className="text-xs text-blue-700 leading-relaxed">
                Verification helps customers identify legitimate businesses. Once approved, a blue checkmark badge will appear next to your shop name across the platform.
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Business License / Registration Number</label>
              <div className="relative">
                <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="e.g. BR-8829-XJ-2024"
                  className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => submitVerification(verifyingShopId, licenseNumber)} 
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition active:scale-95 shadow-lg shadow-blue-100"
              >
                Submit Verification
              </button>
              <button 
                onClick={() => { setVerifyingShopId(null); setLicenseNumber(''); }} 
                className="px-6 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {hasShopsAtAll && (
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4 animate-in fade-in">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Find a shop by name..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all shadow-inner bg-slate-50 focus:bg-white"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <SortAsc className="text-slate-400" size={18} />
              <select 
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'newest')}
                className="px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50"
              >
                <option value="name">Sort by Name</option>
                <option value="newest">Sort by Newest</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'All Shops', icon: <LayoutGrid size={14} /> },
              { id: 'fast-food', label: 'Fast Food', icon: <ChefHat size={14} /> },
              { id: 'hotel', label: 'Hotels', icon: <Hotel size={14} /> },
              { id: 'retail', label: 'Retail', icon: <ShoppingBag size={14} /> },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFilterType(cat.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  filterType === cat.id 
                  ? 'bg-orange-500 text-white shadow-md' 
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-100'
                }`}
              >
                {cat.icon}
                {cat.label}
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${filterType === cat.id ? 'bg-orange-400 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {shopCounts[cat.id as keyof typeof shopCounts]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {filteredShops.length > 0 ? (
          filteredShops.map((shop: Shop) => {
            const shopScans = scans.filter((s: ScanRecord) => s.shopId === shop.id);
            const eligibleCount = new Set(shopScans.filter((s: ScanRecord) => getRewardEligibility(s.customerId, shop.id)).map((s: ScanRecord) => s.customerId)).size;

            return (
              <div key={shop.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition group animate-in fade-in duration-300">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold group-hover:text-orange-500 transition">{shop.name}</h3>
                      {shop.verificationStatus === 'verified' && (
                        <div className="text-blue-500" title="Verified Business">
                          <ShieldCheck size={20} />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                        {shop.type === 'fast-food' && <ChefHat size={12} />}
                        {shop.type === 'hotel' && <Hotel size={12} />}
                        {shop.type === 'retail' && <ShoppingBag size={12} />}
                        {shop.type.replace('-', ' ')}
                      </span>
                      <span className="text-slate-200 text-xs">|</span>
                      {shop.verificationStatus === 'unverified' && (
                        <button 
                          onClick={() => setVerifyingShopId(shop.id)}
                          className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded"
                        >
                          <ShieldAlert size={12} /> Verify Now
                        </button>
                      )}
                      {shop.verificationStatus === 'pending' && (
                        <span className="text-xs font-bold text-amber-600 flex items-center gap-1 italic">
                          <History size={12} /> Pending Review
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="relative group/qr p-3 bg-slate-50 rounded-xl group-hover:bg-orange-50 transition border border-transparent group-hover:border-orange-100">
                    {QRCodeSVG && (
                      <QRCodeSVG 
                        id={`qr-svg-${shop.id}`} 
                        value={`loyalty_scan:${shop.id}`} 
                        size={80} 
                        level="H" 
                        includeMargin={false}
                      />
                    )}
                    <button 
                      onClick={() => downloadQRCodeAsPng(shop.id, shop.name)}
                      className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-600 shadow-lg border border-slate-100 opacity-0 group-hover/qr:opacity-100 transition hover:bg-orange-500 hover:text-white"
                      title="Download as PNG"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="bg-slate-50 p-3 rounded-xl flex items-center justify-between border border-slate-100">
                    <div className="flex items-center gap-2">
                      <Lock size={14} className="text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Secret Code</span>
                    </div>
                    <span className="text-lg font-black text-slate-900 tracking-widest">{shop.secretCode}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl flex items-center justify-between border border-slate-100">
                    <div className="flex items-center gap-2">
                      <Keyboard size={14} className="text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Shop ID (Manual Entry)</span>
                    </div>
                    <span className="font-mono text-xs text-slate-600 select-all">{shop.id}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-slate-50 p-4 rounded-xl group-hover:bg-white border border-transparent group-hover:border-slate-100">
                    <span className="text-xs text-slate-500 block mb-1">Weekly Scans</span>
                    <span className="text-2xl font-bold">{shopScans.length}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl group-hover:bg-white border border-transparent group-hover:border-slate-100">
                    <span className="text-xs text-slate-500 block mb-1">Eligible for Free Food</span>
                    <span className="text-2xl font-bold text-green-600">{eligibleCount}</span>
                  </div>
                </div>

                <button 
                  onClick={() => {
                     const tId = prompt("Enter Transaction ID:");
                     if (tId) handleManualScan(shop.id, tId, new Date().toISOString().split('T')[0]);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition active:scale-95 shadow-lg shadow-slate-200"
                >
                  <QrCode size={18} /> Generate Manual Check-in
                </button>
              </div>
            );
          })
        ) : (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-slate-300 animate-in zoom-in-95">
            <Search className="mx-auto text-slate-300 mb-4" size={48} />
            <h3 className="text-lg font-bold text-slate-400">
              {searchTerm ? 'No results matching your search' : 'No shops found'}
            </h3>
            <p className="text-slate-400 mb-4">
              {searchTerm ? `We couldn't find any shops matching "${searchTerm}"` : 'Add your first shop to get started!'}
            </p>
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="text-orange-500 font-bold hover:underline"
              >
                Clear search query
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const CustomerDashboard = ({ currentUser, shops, scans, getWeeklyScans, onQuickCheckIn }: any) => {
  const [viewDate, setViewDate] = useState(new Date());
  const [activeQuickCheckIn, setActiveQuickCheckIn] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [quickCode, setQuickCode] = useState('');
  const [error, setError] = useState('');

  const weekDays = useMemo(() => {
    const d = new Date(viewDate);
    const startOfWeek = new Date(d.setDate(d.getDate() - d.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);
    
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      return day;
    });
  }, [viewDate]);

  const changeWeek = (offset: number) => {
    const next = new Date(viewDate);
    next.setDate(next.getDate() + (offset * 7));
    setViewDate(next);
  };

  const handleQuickComplete = (shop: Shop) => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (quickCode === shop.secretCode) {
      // FIX: Pass the quickCode as the secret key
      onQuickCheckIn(shop.id, quickCode, '', todayStr);
      setActiveQuickCheckIn(null);
      setQuickCode('');
      setError('');
    } else {
      setError('Invalid code. Please check with the shop.');
    }
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayStr = new Date().toDateString();
  const weekStartStr = weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const weekEndStr = weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <span className="text-orange-400 font-bold uppercase tracking-widest text-xs">Customer Profile</span>
          <h2 className="text-3xl font-bold mt-1">{currentUser?.name}</h2>
          <div className="flex items-center gap-4 mt-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full backdrop-blur-md">
              <Gift className="text-orange-400" size={18} />
              <span className="text-sm font-medium">Rewards Tracker</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full backdrop-blur-md">
              <TrendingUp className="text-green-400" size={18} />
              <span className="text-sm font-medium">Level 1 Regular</span>
            </div>
          </div>
        </div>
        <div className="absolute -right-10 -bottom-10 opacity-10">
          <Store size={200} />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
        <h3 className="text-xl font-bold">Rewards Calendar</h3>
        <div className="flex items-center gap-3 bg-white p-1 rounded-2xl border border-slate-100 shadow-sm">
          <button 
            onClick={() => changeWeek(-1)}
            className="p-2 hover:bg-slate-50 rounded-xl transition text-slate-500"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="px-4 text-xs font-bold text-slate-600 uppercase tracking-tight text-center">
            {weekStartStr} — {weekEndStr}
          </div>
          <button 
            onClick={() => changeWeek(1)}
            className="p-2 hover:bg-slate-50 rounded-xl transition text-slate-500"
          >
            <ChevronRight size={20} />
          </button>
          <div className="h-6 w-px bg-slate-100 mx-1 hidden sm:block"></div>
          <button 
            onClick={() => setViewDate(new Date())}
            className="hidden sm:block px-4 py-2 text-[10px] font-black uppercase text-orange-500 hover:bg-orange-50 rounded-xl transition"
          >
            Today
          </button>
        </div>
      </div>
      
      {shops.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-slate-200">
          <Info className="mx-auto text-slate-300 mb-2" size={32} />
          <p className="text-slate-500">No shops registered in the system yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {shops.map((shop: Shop) => {
            const uniqueDays = currentUser ? getWeeklyScans(currentUser.id, shop.id, weekDays[0]) : [];
            const isEligible = uniqueDays.length >= 6;
            
            // Get all scans for this user and shop to show last visit
            const allShopScans = scans
              .filter((s: ScanRecord) => s.customerId === currentUser?.id && s.shopId === shop.id)
              .sort((a: ScanRecord, b: ScanRecord) => b.timestamp - a.timestamp);
            
            const lastVisit = allShopScans[0];
            const lastVisitDateStr = lastVisit ? new Date(lastVisit.timestamp).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : null;

            return (
              <div key={shop.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition overflow-hidden">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 border border-orange-100 shrink-0">
                      <Store size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <h4 className="font-bold text-lg">{shop.name}</h4>
                        {shop.verificationStatus === 'verified' && (
                          <ShieldCheck size={18} className="text-blue-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-slate-400 tracking-wide uppercase">{uniqueDays.length} / 6 VISITS COMPLETE</p>
                        {lastVisitDateStr && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Clock size={10} /> Last: {lastVisitDateStr}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:items-end gap-2">
                    {isEligible ? (
                      <span className="bg-green-100 text-green-700 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-sm border border-green-200 self-start sm:self-auto">
                        <CheckCircle size={16} /> REWARD UNLOCKED
                      </span>
                    ) : (
                      <div className="flex gap-2">
                         <button 
                          onClick={() => setShowHistory(showHistory === shop.id ? null : shop.id)}
                          className={`p-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
                            showHistory === shop.id 
                              ? 'bg-slate-100 text-slate-900 border-slate-200' 
                              : 'bg-white text-slate-400 border-slate-100 hover:bg-slate-50'
                          }`}
                          title="View Visit History"
                        >
                          <History size={16} />
                        </button>
                        <button 
                          onClick={() => {
                            if (activeQuickCheckIn === shop.id) {
                              setActiveQuickCheckIn(null);
                            } else {
                              setActiveQuickCheckIn(shop.id);
                              setQuickCode('');
                              setError('');
                            }
                          }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm ${
                            activeQuickCheckIn === shop.id 
                              ? 'bg-slate-900 text-white' 
                              : 'bg-orange-500 text-white hover:bg-orange-600 active:scale-95'
                          }`}
                        >
                          {activeQuickCheckIn === shop.id ? <X size={14} /> : <Check size={14} />}
                          {activeQuickCheckIn === shop.id ? 'Cancel' : 'Enter Secret Key'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {showHistory === shop.id && (
                  <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 animate-in slide-in-from-top-4 duration-300">
                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Your Recent Visits</h5>
                    {allShopScans.length > 0 ? (
                      <div className="space-y-2">
                        {allShopScans.slice(0, 5).map((s: ScanRecord) => (
                          <div key={s.id} className="flex items-center justify-between text-xs p-2 bg-white rounded-lg border border-slate-50">
                            <span className="font-medium text-slate-600">
                              Visit completed on {new Date(s.timestamp).getDate()} {new Date(s.timestamp).toLocaleString('default', { month: 'short' })} {new Date(s.timestamp).getFullYear()}
                            </span>
                            <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded uppercase">Completed</span>
                          </div>
                        ))}
                        {allShopScans.length > 5 && <p className="text-[10px] text-center text-slate-400 pt-2 italic">Showing last 5 visits</p>}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 text-center py-2">No visits recorded yet.</p>
                    )}
                  </div>
                )}

                {activeQuickCheckIn === shop.id && (
                  <div className="mb-6 p-4 bg-orange-50 rounded-2xl border border-orange-100 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <div className="relative flex-1 w-full">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400" size={16} />
                        <input 
                          type="text" 
                          value={quickCode}
                          onChange={(e) => { setQuickCode(e.target.value); setError(''); }}
                          placeholder="Enter Shop Secret Key"
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-orange-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm font-bold tracking-widest"
                        />
                      </div>
                      <button 
                        onClick={() => handleQuickComplete(shop)}
                        className="w-full sm:w-auto bg-slate-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition whitespace-nowrap"
                      >
                        Mark Visit Done
                      </button>
                    </div>
                    {error && <p className="text-red-500 text-[10px] font-bold mt-2 px-1 uppercase tracking-wider">{error}</p>}
                    <p className="text-[10px] text-orange-400 mt-2 px-1">Ask the shop staff for the daily secret key.</p>
                  </div>
                )}

                <div className="grid grid-cols-7 gap-2 mb-6">
                  {weekDays.map((date, idx) => {
                    const dateStr = date.toDateString();
                    const isVisited = uniqueDays.includes(dateStr);
                    const isToday = dateStr === todayStr;

                    return (
                      <div 
                        key={idx}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all duration-300 border-2 ${
                          isVisited 
                          ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-100 scale-105' 
                          : isToday
                            ? 'bg-white border-orange-200 border-dashed text-slate-400'
                            : 'bg-slate-50 border-transparent text-slate-300'
                        }`}
                      >
                        <span className={`text-[10px] font-bold uppercase tracking-tighter ${isVisited ? 'text-white/80' : 'text-slate-400'}`}>
                          {dayNames[idx]}
                        </span>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          isVisited ? 'bg-white/20' : 'bg-transparent'
                        }`}>
                          {isVisited ? <CheckCircle size={18} /> : date.getDate()}
                        </div>
                        {isToday && !isVisited && (
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"></div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className={`text-sm flex items-center gap-3 p-4 rounded-xl font-medium transition-colors ${
                  isEligible 
                    ? "bg-green-50 text-green-700 border border-green-100" 
                    : "bg-slate-50 text-slate-500 border border-slate-100"
                }`}>
                  <div className={`p-1.5 rounded-lg ${isEligible ? 'bg-green-100' : 'bg-white'}`}>
                    {isEligible ? <Gift size={18} /> : <Info size={18} />}
                  </div>
                  {isEligible 
                    ? "Success! Show this screen at the counter to claim your free reward." 
                    : `Keep it up! You need ${Math.max(0, 6 - uniqueDays.length)} more unique days this week to earn your free item.`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ScannerView = ({ onScanMatch, onDirectManualCheckIn }: any) => {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [manualSecret, setManualSecret] = useState('');
  const [entryMode, setEntryMode] = useState<'qr' | 'manual'>('qr');
  const [error, setError] = useState('');

  useEffect(() => {
    if (entryMode === 'qr' && !scannerRef.current) {
      scannerRef.current = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );
      scannerRef.current.render(onScanSuccess, onScanError);
    } else if (entryMode === 'manual' && scannerRef.current) {
      scannerRef.current.clear().catch(console.error);
      scannerRef.current = null;
    }

    function onScanSuccess(decodedText: string) {
      if (decodedText.startsWith('loyalty_scan:')) {
        const shopId = decodedText.split(':')[1];
        scannerRef.current?.clear().then(() => {
          onScanMatch(shopId);
        });
      }
    }

    function onScanError(err: any) {}

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
    };
  }, [entryMode]);

  const handleManualEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim() && manualSecret.trim()) {
      onDirectManualCheckIn(manualCode.trim(), manualSecret.trim(), '', new Date().toISOString().split('T')[0]);
    } else if (manualCode.trim()) {
      onScanMatch(manualCode.trim());
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6 animate-in zoom-in-95 duration-300 px-2">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Record Your Visit</h2>
        <p className="text-slate-500 text-sm">Scan the QR code at the counter or enter the shop details manually.</p>
      </div>

      <div className="flex bg-slate-100 p-1 rounded-2xl shadow-inner">
        <button 
          onClick={() => setEntryMode('qr')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition ${entryMode === 'qr' ? 'bg-white shadow-md text-orange-600' : 'text-slate-500'}`}
        >
          <Scan size={18} /> QR Scanner
        </button>
        <button 
          onClick={() => setEntryMode('manual')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition ${entryMode === 'manual' ? 'bg-white shadow-md text-orange-600' : 'text-slate-500'}`}
        >
          <Keyboard size={18} /> Manual Entry
        </button>
      </div>

      {entryMode === 'qr' ? (
        <div id="qr-reader" className="qr-scanner-container bg-white rounded-3xl overflow-hidden border-4 border-orange-500 shadow-2xl"></div>
      ) : (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl animate-in slide-in-from-bottom-4">
          <form onSubmit={handleManualEntry} className="space-y-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Store size={32} />
              </div>
              <p className="text-slate-600 text-sm">Enter the unique <strong>Shop ID</strong> and the <strong>Secret Code</strong> provided at the counter.</p>
            </div>
            
            <div className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text"
                  required
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Shop ID"
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-orange-50 focus:border-orange-500 outline-none font-mono text-sm"
                />
              </div>

              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text"
                  required
                  value={manualSecret}
                  onChange={(e) => setManualSecret(e.target.value)}
                  placeholder="Secret Verification Code"
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-orange-50 focus:border-orange-500 outline-none font-bold tracking-widest text-center"
                />
              </div>
            </div>

            <button 
              type="submit"
              className="w-full bg-orange-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-orange-600 transition shadow-lg shadow-orange-100 flex items-center justify-center gap-2"
            >
              Mark Complete <CheckCircle size={20} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

const AdminPanel = ({ shops, updateVerificationStatus, setActiveTab }: any) => (
  <div className="space-y-6 animate-in slide-in-from-top-4 duration-500">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-bold">Verification Review Center</h2>
        <p className="text-slate-500">System admin area to approve shop verification requests</p>
      </div>
      <button onClick={() => setActiveTab('shop')} className="text-slate-600 flex items-center gap-1 hover:text-slate-900">
        <ChevronRight size={18} className="rotate-180" /> Back to Dashboard
      </button>
    </div>

    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr>
            <th className="px-6 py-4 font-bold text-sm text-slate-600">Shop Name</th>
            <th className="px-6 py-4 font-bold text-sm text-slate-600">License ID</th>
            <th className="px-6 py-4 font-bold text-sm text-slate-600">Status</th>
            <th className="px-6 py-4 font-bold text-sm text-slate-600 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {shops.filter((s: Shop) => s.verificationStatus === 'pending' || s.verificationStatus === 'verified').map((shop: Shop) => (
            <tr key={shop.id} className="hover:bg-slate-50 transition">
              <td className="px-6 py-4 font-bold">{shop.name}</td>
              <td className="px-6 py-4 text-sm font-mono text-blue-600">{shop.licenseNumber || 'N/A'}</td>
              <td className="px-6 py-4">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  shop.verificationStatus === 'verified' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {shop.verificationStatus.toUpperCase()}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                {shop.verificationStatus === 'pending' ? (
                  <div className="flex justify-end gap-2">
                    <button onClick={() => updateVerificationStatus(shop.id, 'verified')} className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-bold">Approve</button>
                    <button onClick={() => updateVerificationStatus(shop.id, 'unverified')} className="bg-red-50 text-red-600 px-3 py-1 rounded-lg text-xs font-bold">Reject</button>
                  </div>
                ) : (
                  <button onClick={() => updateVerificationStatus(shop.id, 'unverified')} className="text-red-500 hover:text-red-700 text-xs font-bold">Revoke</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// --- Main App Component ---
const App = () => {
  const [activeTab, setActiveTab] = useState<'home' | 'shop' | 'customer' | 'scan' | 'admin'>('home');
  const [shops, setShops] = useState<Shop[]>([]);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  
  // UI states
  const [regRole, setRegRole] = useState<UserRole>('customer');
  const [isRegistering, setIsRegistering] = useState(false);
  const [verifyingShopId, setVerifyingShopId] = useState<string | null>(null);
  const [recentRegisteredShop, setRecentRegisteredShop] = useState<Shop | null>(null);
  const [pendingScanShop, setPendingScanShop] = useState<Shop | null>(null);
  const [showVisitSuccess, setShowVisitSuccess] = useState(false);
  const [lastSuccessDate, setLastSuccessDate] = useState<string | null>(null);
  
  // Form States
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [newShopName, setNewShopName] = useState('');
  const [newShopEmail, setNewShopEmail] = useState('');
  const [newShopType, setNewShopType] = useState<ShopType>('fast-food');
  const [newShopSecretCode, setNewShopSecretCode] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [filterType, setFilterType] = useState<ShopType | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'newest'>('name');

  useEffect(() => {
    const savedShops = localStorage.getItem(STORAGE_KEYS.SHOPS);
    const savedScans = localStorage.getItem(STORAGE_KEYS.SCANS);
    const savedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
    const savedUid = localStorage.getItem(STORAGE_KEYS.LOGGED_IN_USER_ID);

    const loadedUsers: AppUser[] = savedUsers ? JSON.parse(savedUsers) : [];
    setUsers(loadedUsers);
    setShops(savedShops ? JSON.parse(savedShops) : []);
    setScans(savedScans ? JSON.parse(savedScans) : []);

    if (savedUid) {
      const user = loadedUsers.find(u => u.id === savedUid);
      if (user) {
        setCurrentUser(user);
        setActiveTab(user.role === 'owner' ? 'shop' : 'customer');
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SHOPS, JSON.stringify(shops));
    localStorage.setItem(STORAGE_KEYS.SCANS, JSON.stringify(scans));
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    if (currentUser) {
      localStorage.setItem(STORAGE_KEYS.LOGGED_IN_USER_ID, currentUser.id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.LOGGED_IN_USER_ID);
    }
  }, [shops, scans, users, currentUser]);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regEmail) return;
    
    const newUser: AppUser = {
      id: `u_${Date.now()}`,
      name: regName,
      email: regEmail,
      role: regRole
    };
    
    setUsers([...users, newUser]);
    setCurrentUser(newUser);
    setRegName('');
    setRegEmail('');
    setActiveTab(regRole === 'owner' ? 'shop' : 'customer');
  };

  const logout = () => {
    setCurrentUser(null);
    setActiveTab('home');
  };

  const addShop = () => {
    if (!newShopName || !newShopEmail || !currentUser) return;
    const newShop: Shop = {
      id: `shop_${Date.now()}`,
      name: newShopName,
      type: newShopType,
      ownerId: currentUser.id,
      ownerEmail: newShopEmail,
      verificationStatus: 'unverified',
      secretCode: newShopSecretCode || Math.floor(1000 + Math.random() * 9000).toString()
    };
    setShops([...shops, newShop]);
    setRecentRegisteredShop(newShop);
    setNewShopName('');
    setNewShopEmail('');
    setNewShopSecretCode('');
    setIsRegistering(false);
  };

  const submitVerification = (shopId: string, license: string) => {
    if (!license) return alert("Please enter a valid license number.");
    setShops(shops.map(s => s.id === shopId ? { ...s, verificationStatus: 'pending', licenseNumber: license } : s));
    setVerifyingShopId(null);
    setLicenseNumber('');
    alert("Verification details submitted for review.");
  };

  const updateVerificationStatus = (shopId: string, status: VerificationStatus) => {
    setShops(shops.map(s => s.id === shopId ? { ...s, verificationStatus: status } : s));
  };

  const recordVisit = (shopId: string, transactionId: string, visitDate: string) => {
    if (!currentUser) return;
    
    const shop = shops.find(s => s.id === shopId);
    if (!shop) return alert("Shop not found.");

    // Create timestamp from selected date at the current time
    const selectedDate = new Date(visitDate);
    const now = new Date();
    selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());

    const newScan: ScanRecord = {
      id: `scan_${Date.now()}`,
      shopId,
      customerId: currentUser.id,
      timestamp: selectedDate.getTime(),
      transactionId
    };
    setScans([newScan, ...scans]);
    setPendingScanShop(null);
    setLastSuccessDate(visitDate);
    setShowVisitSuccess(true);
    setTimeout(() => {
      setShowVisitSuccess(false);
      setLastSuccessDate(null);
      setActiveTab('customer');
    }, 3000);
  };

  const handleDirectManualCheckIn = (shopId: string, secretCode: string, transactionId: string, visitDate: string) => {
    const shop = shops.find(s => s.id === shopId);
    if (!shop) return alert("Invalid Shop ID. Please check and try again.");
    if (shop.secretCode !== secretCode) {
      console.log('Secret Mismatch:', { typed: secretCode, actual: shop.secretCode });
      return alert("Invalid Secret Verification Code. Please try again.");
    }
    
    // Check if already visited today (or on selected date)
    if (checkVisitedOnDate(currentUser?.id || '', shopId, new Date(visitDate).toDateString())) {
      return alert("A visit is already recorded for this date.");
    }

    recordVisit(shopId, transactionId, visitDate);
  };

  const onScanMatch = (shopId: string) => {
    const shop = shops.find(s => s.id === shopId);
    if (shop) {
      setPendingScanShop(shop);
    } else {
      alert("Invalid shop code. Please check and try again.");
    }
  };

  // --- Logic Helpers ---
  const getWeeklyScans = (customerId: string, shopId: string, weekStart: Date) => {
    const startOfWeekTime = weekStart.getTime();
    const endOfWeekTime = startOfWeekTime + (7 * 24 * 60 * 60 * 1000);

    const weekly = scans.filter(s => 
      s.customerId === customerId && 
      s.shopId === shopId && 
      s.timestamp >= startOfWeekTime &&
      s.timestamp < endOfWeekTime
    );

    const uniqueDays = new Set(weekly.map(s => new Date(s.timestamp).toDateString()));
    return Array.from(uniqueDays);
  };

  const checkVisitedOnDate = (customerId: string, shopId: string, dateStr: string) => {
    return scans.some(s => 
      s.customerId === customerId && 
      s.shopId === shopId && 
      new Date(s.timestamp).toDateString() === dateStr
    );
  };

  const getRewardEligibility = (customerId: string, shopId: string) => {
    // Current week eligibility
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);
    const uniqueDays = getWeeklyScans(customerId, shopId, startOfWeek);
    return uniqueDays.length >= 6;
  };

  const filteredShops = useMemo(() => {
    return shops
      .filter(shop => {
        const matchesType = filterType === 'all' || shop.type === filterType;
        const matchesSearch = shop.name.toLowerCase().includes(searchTerm.toLowerCase());
        const isOwnerView = currentUser?.role === 'owner' ? shop.ownerId === currentUser.id : true;
        return matchesType && matchesSearch && isOwnerView;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'newest') return b.id.localeCompare(a.id);
        return 0;
      });
  }, [shops, filterType, searchTerm, sortBy, currentUser]);

  const shopCounts = useMemo(() => {
    const myShops = currentUser?.role === 'owner' ? shops.filter(s => s.ownerId === currentUser.id) : shops;
    return {
      all: myShops.length,
      'fast-food': myShops.filter(s => s.type === 'fast-food').length,
      hotel: myShops.filter(s => s.type === 'hotel').length,
      retail: myShops.filter(s => s.type === 'retail').length,
    };
  }, [shops, currentUser]);

  const unverifiedShops = useMemo(() => 
    shops.filter(s => s.ownerId === currentUser?.id && s.verificationStatus === 'unverified'),
  [shops, currentUser]);

  return (
    <div className="min-h-screen pb-24 md:pb-8 flex flex-col bg-[#f8fafc]">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 px-4 md:px-8">
        <div className="max-w-5xl mx-auto h-16 flex justify-between items-center">
          <div onClick={() => setActiveTab('home')} className="flex items-center gap-2 cursor-pointer">
            <div className="bg-orange-500 p-1.5 rounded-lg text-white">
              <CheckCircle size={24} />
            </div>
            <span className="text-xl font-black text-slate-900 tracking-tight hidden sm:inline">LOYALTY REWARDS</span>
          </div>

          <div className="flex items-center gap-4">
            {currentUser && (
              <div className="hidden md:flex gap-4">
                <button onClick={() => setActiveTab('home')} className={`font-medium ${activeTab === 'home' ? 'text-orange-500' : 'text-slate-500'}`}>Overview</button>
                {currentUser.role === 'customer' && (
                  <button onClick={() => setActiveTab('customer')} className={`font-medium ${activeTab === 'customer' ? 'text-orange-500' : 'text-slate-500'}`}>My Rewards</button>
                )}
                {currentUser.role === 'owner' && (
                  <button onClick={() => setActiveTab('shop')} className={`font-medium ${activeTab === 'shop' ? 'text-orange-500' : 'text-slate-500'}`}>Shop Owner</button>
                )}
              </div>
            )}
            
            {currentUser ? (
              <div className="flex items-center gap-2 bg-slate-100 pl-3 pr-1 py-1 rounded-full">
                <span className="text-sm font-bold text-slate-700">{currentUser.name.split(' ')[0]}</span>
                <button 
                  onClick={logout}
                  className="p-1.5 bg-white rounded-full text-slate-500 hover:text-red-500 transition shadow-sm"
                  title="Logout"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsRegistering(true)}
                className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-800 transition"
              >
                Get Started
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8">
        {isRegistering && !currentUser ? (
          <RegistrationView 
            regRole={regRole} setRegRole={setRegRole} 
            regName={regName} setRegName={setRegName} 
            regEmail={regEmail} setRegEmail={setRegEmail} 
            handleRegister={handleRegister} 
          />
        ) : (
          <>
            {activeTab === 'home' && <HomeView currentUser={currentUser} setIsRegistering={setIsRegistering} setRegRole={setRegRole} />}
            {activeTab === 'shop' && (
              <ShopDashboard 
                currentUser={currentUser} shops={shops} scans={scans} setActiveTab={setActiveTab} 
                setIsRegistering={setIsRegistering} isRegistering={isRegistering}
                newShopName={newShopName} setNewShopName={setNewShopName}
                newShopEmail={newShopEmail} setNewShopEmail={setNewShopEmail}
                newShopType={newShopType} setNewShopType={setNewShopType}
                newShopSecretCode={newShopSecretCode} setNewShopSecretCode={setNewShopSecretCode}
                addShop={addShop} verifyingShopId={verifyingShopId} setVerifyingShopId={setVerifyingShopId}
                licenseNumber={licenseNumber} setLicenseNumber={setLicenseNumber}
                submitVerification={submitVerification} unverifiedShops={unverifiedShops}
                searchTerm={searchTerm} setSearchTerm={setSearchTerm}
                sortBy={sortBy} setSortBy={setSortBy}
                filteredShops={filteredShops} shopCounts={shopCounts}
                filterType={filterType} setFilterType={setFilterType}
                handleManualScan={recordVisit} getRewardEligibility={getRewardEligibility}
              />
            )}
            {activeTab === 'admin' && <AdminPanel shops={shops} updateVerificationStatus={updateVerificationStatus} setActiveTab={setActiveTab} />}
            {activeTab === 'customer' && (
              <CustomerDashboard 
                currentUser={currentUser} 
                shops={shops} 
                scans={scans}
                getWeeklyScans={getWeeklyScans} 
                onQuickCheckIn={handleDirectManualCheckIn}
              />
            )}
            {activeTab === 'scan' && (
              <ScannerView 
                onScanMatch={onScanMatch} 
                onDirectManualCheckIn={handleDirectManualCheckIn} 
              />
            )}
          </>
        )}
      </main>

      {/* Confirmation & Success Modals */}
      {pendingScanShop && currentUser && (
        <ScanConfirmationModal 
          shop={pendingScanShop}
          alreadyVisitedOn={(dateStr) => checkVisitedOnDate(currentUser.id, pendingScanShop.id, dateStr)}
          onConfirm={(tId, date) => recordVisit(pendingScanShop.id, tId, date)}
          onCancel={() => { setPendingScanShop(null); setActiveTab('customer'); }}
        />
      )}

      {showVisitSuccess && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white p-12 rounded-3xl shadow-2xl text-center animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center text-white mx-auto mb-6 shadow-xl shadow-green-100">
              <Sparkles size={48} className="animate-bounce" />
            </div>
            <h3 className="text-3xl font-black text-slate-900">Visit Complete!</h3>
            {lastSuccessDate && (
              <div className="mt-4 p-4 bg-green-50 rounded-2xl border border-green-100">
                <p className="text-green-700 font-bold text-lg">
                  Visit on {new Date(lastSuccessDate).getDate()} Completed
                </p>
                <p className="text-green-600 text-sm mt-1">
                  Recorded on {new Date(lastSuccessDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </p>
              </div>
            )}
            <p className="text-slate-400 text-xs mt-6">Stamp added to your loyalty card.</p>
          </div>
        </div>
      )}

      {recentRegisteredShop && (
        <RegistrationSuccessModal 
          shop={recentRegisteredShop} 
          onClose={() => setRecentRegisteredShop(null)} 
        />
      )}

      {/* Mobile Tab Bar */}
      {currentUser && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around py-4 px-2 z-50">
          <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-orange-500' : 'text-slate-400'}`}>
            <Store size={22} /><span className="text-[10px] font-bold">Home</span>
          </button>
          {currentUser.role === 'customer' ? (
            <>
              <button onClick={() => setActiveTab('customer')} className={`flex flex-col items-center gap-1 ${activeTab === 'customer' ? 'text-orange-500' : 'text-slate-400'}`}>
                <UserCircle size={22} /><span className="text-[10px] font-bold">Rewards</span>
              </button>
              <div className="relative -top-8">
                <button onClick={() => setActiveTab('scan')} className="bg-orange-500 text-white p-4 rounded-full shadow-lg border-4 border-white active:scale-90 transition-transform"><Scan size={28} /></button>
              </div>
            </>
          ) : (
            <button onClick={() => setActiveTab('shop')} className={`flex flex-col items-center gap-1 ${activeTab === 'shop' ? 'text-orange-500' : 'text-slate-400'}`}>
              <LayoutGrid size={22} /><span className="text-[10px] font-bold">Dashboard</span>
            </button>
          )}
          <button onClick={logout} className="flex flex-col items-center gap-1 text-slate-400">
            <LogOut size={22} /><span className="text-[10px] font-bold">Logout</span>
          </button>
        </div>
      )}
    </div>
  );
};

// Render
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
