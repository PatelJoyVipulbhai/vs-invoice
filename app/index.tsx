import React, { useState, useEffect } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Dimensions,
  useWindowDimensions,
  Alert,
  Platform,
  Image,
} from "react-native";
import { Ionicons, FontAwesome, MaterialIcons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { collection, addDoc, deleteDoc, doc, onSnapshot, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import DateTimePicker from "@react-native-community/datetimepicker";

// Define customer interface
interface Customer {
  id: string;
  company: string;
  gstin?: string;
  email?: string;
  phone?: string;
  address?: string;
  pincode?: string;
  locality?: string;
  city?: string;
  state?: string;
  personName?: string;
}

interface LineItem {
  description: string;
  quantity: number;
  rate: number;
  gstPercent: number;
  amount: number;
  unit?: string;
}

interface Quote {
  id: string;
  quoteNumber: string;
  customerId: string;
  customerName: string;
  quoteDate: string;
  expiryDate: string;
  items: LineItem[];
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  status: "Draft" | "Sent" | "Approved" | "Declined" | "Invoiced";
  notes?: string;
  hsnCode?: string;
  vehicleNo?: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  items: LineItem[];
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  status: "Draft" | "Sent" | "Paid" | "Unpaid" | "Overdue" | "Cancelled";
  notes?: string;
  clientType1?: string;
  selectedCustomerId1?: string;
  clientType2?: string;
  selectedCustomerId2?: string;
  customerName2?: string;
  isRoundOff?: boolean;
  hsnCode?: string;
  vehicleNo?: string;
}

function toIndianWords(num: number): string {
  const a = [
    '', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ',
    'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '
  ];
  const b = ['', '', 'Twenty ', 'Thirty ', 'Forty ', 'Fifty ', 'Sixty ', 'Seventy ', 'Eighty ', 'Ninety '];

  const numStr = Math.floor(num).toString();
  if (numStr.length > 9) return 'Amount too large';

  const n = ('000000000' + numStr).slice(-9);
  const crore = parseInt(n.slice(0, 2));
  const lakh = parseInt(n.slice(2, 4));
  const thousand = parseInt(n.slice(4, 6));
  const hundred = parseInt(n.slice(6, 7));
  const tens = parseInt(n.slice(7, 9));

  let str = '';
  if (crore > 0) {
    str += (crore < 20 ? a[crore] : b[Math.floor(crore / 10)] + a[crore % 10]) + 'Crore ';
  }
  if (lakh > 0) {
    str += (lakh < 20 ? a[lakh] : b[Math.floor(lakh / 10)] + a[lakh % 10]) + 'Lakh ';
  }
  if (thousand > 0) {
    str += (thousand < 20 ? a[thousand] : b[Math.floor(thousand / 10)] + a[thousand % 10]) + 'Thousand ';
  }
  if (hundred > 0) {
    str += a[hundred] + 'Hundred ';
  }
  if (tens > 0) {
    str += (tens < 20 ? a[tens] : b[Math.floor(tens / 10)] + a[tens % 10]);
  }
  return str.trim() ? str.trim() + ' only' : 'Zero only';
}

function formatDateToDDMMYYYY(dateStr: string): string {
  if (!dateStr) return "";
  const dateOnly = dateStr.split("T")[0].trim();

  // Check for YYYY-MM-DD format
  let parts = dateOnly.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  // Check for YYYY/MM/DD format
  parts = dateOnly.split("/");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  return dateOnly;
}


export default function Index() {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 1024;

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [pin, setPin] = useState<string>("");
  const [pinError, setPinError] = useState<string>("");

  const handleKeyPress = (num: string) => {
    setPinError("");
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin === "9876") {
        setTimeout(() => {
          setIsAuthenticated(true);
        }, 150);
      } else if (newPin.length === 4) {
        setTimeout(() => {
          setPinError("Incorrect PIN. Please try again.");
          setPin("");
        }, 200);
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setPinError("");
  };

  // State Management
  const [activeTab, setActiveTab] = useState<string>("Home");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);

  // Quotes and Invoices state
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  // Modals state
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState<boolean>(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  // Quote & Invoice Form Fields
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  // Invoice Multi-party state
  const [clientType1, setClientType1] = useState<string>("Bill To");
  const [selectedCustomerId1, setSelectedCustomerId1] = useState<string>("");
  const [customerSearchQuery1, setCustomerSearchQuery1] = useState<string>("");
  const [showType1Dropdown, setShowType1Dropdown] = useState<boolean>(false);

  const [clientType2, setClientType2] = useState<string>("Ship To");
  const [selectedCustomerId2, setSelectedCustomerId2] = useState<string>("");
  const [customerSearchQuery2, setCustomerSearchQuery2] = useState<string>("");
  const [showType2Dropdown, setShowType2Dropdown] = useState<boolean>(false);

  const [isRoundOff, setIsRoundOff] = useState<boolean>(false);

  // My Details Settings
  const [myCompanyName, setMyCompanyName] = useState<string>("V S ENTERPRISE");
  const [myGstin, setMyGstin] = useState<string>("");
  const [myAddress, setMyAddress] = useState<string>("");
  const [myLogoUrl, setMyLogoUrl] = useState<string>("");
  const [myEmail, setMyEmail] = useState<string>("info@vsenterprise.com");
  const [myMobile, setMyMobile] = useState<string>("9909004740");
  const [myBankName, setMyBankName] = useState<string>("AXIS BANK");
  const [myBankAccountNo, setMyBankAccountNo] = useState<string>("921020057527491");
  const [myBankIfsc, setMyBankIfsc] = useState<string>("UTIB0003655");
  const [myTerms, setMyTerms] = useState<string>("");
  const [isMyDetailsModalOpen, setIsMyDetailsModalOpen] = useState<boolean>(false);

  // Document metadata state
  const [hsnCode, setHsnCode] = useState<string>("");
  const [vehicleNo, setVehicleNo] = useState<string>("");

  const [docNumber, setDocNumber] = useState<string>("");
  const [docDate, setDocDate] = useState<string>("");
  const [docExpiryOrDueDate, setDocExpiryOrDueDate] = useState<string>("");
  const [docNotes, setDocNotes] = useState<string>("");
  const [docItems, setDocItems] = useState<LineItem[]>([
    { description: "", quantity: 1, rate: 0, gstPercent: 18, amount: 0, unit: "Pcs" }
  ]);
  const [quoteStatus, setQuoteStatus] = useState<Quote["status"]>("Draft");
  const [invoiceStatus, setInvoiceStatus] = useState<Invoice["status"]>("Unpaid");
  const [openUnitDropdownIndex, setOpenUnitDropdownIndex] = useState<number | null>(null);
  const [taxPercent, setTaxPercent] = useState<string>("18");
  const [gstRateSelection, setGstRateSelection] = useState<string>("CGST 9% + SGST 9%");
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>("");
  const [showDocDatePicker, setShowDocDatePicker] = useState<boolean>(false);
  const [showDocExpiryDatePicker, setShowDocExpiryDatePicker] = useState<boolean>(false);

  // Form State for Customer
  const [company, setCompany] = useState("");
  const [gstin, setGstin] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [locality, setLocality] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [personName, setPersonName] = useState("");
  const [pincodeError, setPincodeError] = useState("");

  const resetForm = () => {
    setCompany("");
    setGstin("");
    setEmail("");
    setPhone("");
    setAddress("");
    setPincode("");
    setLocality("");
    setCity("");
    setState("");
    setPersonName("");
    setPincodeError("");
    setEditingCustomerId(null);
  };

  const resetQuoteForm = () => {
    setSelectedCustomerId("");
    setDocNumber("");
    setDocDate(new Date().toISOString().split("T")[0]);
    setDocExpiryOrDueDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
    setDocNotes("");
    setDocItems([{ description: "", quantity: 1, rate: 0, gstPercent: 18, amount: 0, unit: "Pcs" }]);
    setQuoteStatus("Draft");
    setEditingQuoteId(null);
    setOpenUnitDropdownIndex(null);
    setTaxPercent("18");
    setGstRateSelection("CGST 9% + SGST 9%");
    setHsnCode("");
    setVehicleNo("");
  };

  const resetInvoiceForm = () => {
    setSelectedCustomerId("");
    setSelectedCustomerId1("");
    setSelectedCustomerId2("");
    setClientType1("Bill To");
    setClientType2("Ship To");
    setCustomerSearchQuery("");
    setCustomerSearchQuery1("");
    setCustomerSearchQuery2("");
    setShowType1Dropdown(false);
    setShowType2Dropdown(false);
    setIsRoundOff(false);
    setDocNumber("");
    setDocDate(new Date().toISOString().split("T")[0]);
    setDocExpiryOrDueDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
    setDocNotes("");
    setDocItems([{ description: "", quantity: 1, rate: 0, gstPercent: 18, amount: 0, unit: "Pcs" }]);
    setInvoiceStatus("Unpaid");
    setEditingInvoiceId(null);
    setOpenUnitDropdownIndex(null);
    setTaxPercent("18");
    setGstRateSelection("CGST 9% + SGST 9%");
    setHsnCode("");
    setVehicleNo("");
  };

  // Auto-detect City & State from Indian Pincode
  useEffect(() => {
    if (pincode.length === 6) {
      setPincodeError("");
      fetch(`https://api.postalpincode.in/pincode/${pincode}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data[0] && data[0].Status === "Success") {
            const postOffice = data[0].PostOffice?.[0];
            if (postOffice) {
              setLocality(postOffice.Name || "");
              setCity(postOffice.District || postOffice.Division || "");
              setState(postOffice.State || "");
              setPincodeError("");
            } else {
              setPincodeError("Invalid Pincode. No records found.");
              setLocality("");
              setCity("");
              setState("");
            }
          } else {
            setPincodeError("Invalid Pincode. No records found.");
            setLocality("");
            setCity("");
            setState("");
          }
        })
        .catch((err) => {
          console.log("Pincode API error:", err);
          setPincodeError("Failed to validate pincode.");
        });
    } else if (pincode.length > 0 && pincode.length !== 6) {
      setPincodeError("Pincode must be exactly 6 digits.");
    } else {
      setPincodeError("");
    }
  }, [pincode]);

  // Sync Customers from Firestore in Real-time
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "customers"), (snapshot) => {
      const customersList: Customer[] = [];
      snapshot.forEach((docSnap) => {
        customersList.push({ id: docSnap.id, ...docSnap.data() } as Customer);
      });
      // Sort customers so newly created ones are at the top
      customersList.sort((a, b) => {
        const aTime = (a as any).createdAt || 0;
        const bTime = (b as any).createdAt || 0;
        return bTime - aTime;
      });
      setCustomers(customersList);
    });
    return () => unsubscribe();
  }, []);

  // Sync Quotes from Firestore in Real-time
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "quotes"), (snapshot) => {
      const quotesList: Quote[] = [];
      snapshot.forEach((docSnap) => {
        quotesList.push({ id: docSnap.id, ...docSnap.data() } as Quote);
      });
      // Sort by quote number or date desc
      quotesList.sort((a, b) => b.quoteNumber.localeCompare(a.quoteNumber));
      setQuotes(quotesList);
    });
    return () => unsubscribe();
  }, []);

  // Sync Invoices from Firestore in Real-time
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "invoices"), (snapshot) => {
      const invoicesList: Invoice[] = [];
      snapshot.forEach((docSnap) => {
        invoicesList.push({ id: docSnap.id, ...docSnap.data() } as Invoice);
      });
      invoicesList.sort((a, b) => b.invoiceNumber.localeCompare(a.invoiceNumber));
      setInvoices(invoicesList);
    });
    return () => unsubscribe();
  }, []);

  // Sync My Details from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "settings", "myDetails"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setMyCompanyName(data.companyName || "Cleva Invoice System");
        setMyGstin(data.gstin || "");
        setMyAddress(data.address || "");
        setMyLogoUrl(data.logoUrl || "");
        setMyEmail(data.email || "");
        setMyMobile(data.mobile || "");
        setMyBankName(data.bankName || "");
        setMyBankAccountNo(data.bankAccountNo || "");
        setMyBankIfsc(data.bankIfsc || "");
        setMyTerms(data.terms || "");
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSaveMyDetails = async () => {
    try {
      await setDoc(doc(db, "settings", "myDetails"), {
        companyName: myCompanyName,
        gstin: myGstin,
        address: myAddress,
        logoUrl: myLogoUrl,
        email: myEmail,
        mobile: myMobile,
        bankName: myBankName,
        bankAccountNo: myBankAccountNo,
        bankIfsc: myBankIfsc,
        terms: myTerms,
      });
      setIsMyDetailsModalOpen(false);
      Alert.alert("Success", "Company details saved successfully.");
    } catch (error) {
      console.error("Error saving company details: ", error);
      Alert.alert("Error", "Failed to save company details.");
    }
  };

  // Automatically select GST Rate based on Customer's State
  useEffect(() => {
    const activeCustId = selectedCustomerId1 || selectedCustomerId;
    if (activeCustId) {
      const customer = customers.find((c) => c.id === activeCustId);
      if (customer) {
        const stateStr = (customer.state || "").trim().toLowerCase();
        if (stateStr === "gujarat") {
          setGstRateSelection("CGST 9% + SGST 9%");
        } else {
          setGstRateSelection("IGST 18%");
        }
      }
    }
  }, [selectedCustomerId, selectedCustomerId1, customers]);

  const handleSaveCustomer = async () => {
    if (!company) return; // Only Company Name is compulsory
    try {
      const customerData = {
        company,
        gstin,
        email,
        phone,
        address,
        pincode,
        locality,
        city,
        state,
        personName,
        createdAt: (editingCustomerId ? undefined : Date.now()),
      };

      if (editingCustomerId) {
        // Remove undefined fields to prevent overwriting
        const cleanData = { ...customerData };
        delete cleanData.createdAt;
        await updateDoc(doc(db, "customers", editingCustomerId), cleanData);
      } else {
        await addDoc(collection(db, "customers"), {
          ...customerData,
          createdAt: Date.now(),
        });
      }
      resetForm();
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving customer to Firestore: ", error);
    }
  };

  const handleEditCustomer = (c: Customer) => {
    setEditingCustomerId(c.id);
    setCompany(c.company || "");
    setGstin(c.gstin || "");
    setEmail(c.email || "");
    setPhone(c.phone || "");
    setAddress(c.address || "");
    setPincode(c.pincode || "");
    setLocality(c.locality || "");
    setCity(c.city || "");
    setState(c.state || "");
    setPersonName(c.personName || "");
    setIsModalOpen(true);
  };

  const handleDeleteCustomer = async (id: string, name: string) => {
    const confirmDelete = () => {
      deleteDoc(doc(db, "customers", id)).catch((error) =>
        console.error("Error deleting customer from Firestore: ", error)
      );
    };

    if (typeof window !== "undefined" && (window as any).confirm) {
      if ((window as any).confirm(`Are you sure you want to delete ${name}?`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        "Confirm Delete",
        `Are you sure you want to delete ${name}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: confirmDelete }
        ]
      );
    }
  };

  // Quotes and Invoices operations
  const handleSaveQuote = async () => {
    if (!selectedCustomerId || docItems.length === 0) {
      Alert.alert("Error", "Please select a customer and add at least one line item.");
      return;
    }
    const customer = customers.find(c => c.id === selectedCustomerId);
    const customerName = customer ? (customer.company || (customer as any).name || "Unnamed Customer") : "Unknown Customer";

    const subtotal = docItems.reduce((acc, item) => acc + (Number(item.rate) * Number(item.quantity)), 0);
    const gstAmount = subtotal * ((Number(taxPercent) || 0) / 100);
    const grandTotal = subtotal + gstAmount;

    try {
      const quoteData = {
        quoteNumber: docNumber,
        customerId: selectedCustomerId,
        customerName,
        quoteDate: docDate,
        expiryDate: docExpiryOrDueDate,
        items: docItems.map(item => ({
          description: item.description,
          quantity: Number(item.quantity),
          rate: Number(item.rate),
          gstPercent: Number(taxPercent) || 0,
          amount: Number(item.rate) * Number(item.quantity),
          unit: item.unit || "Pcs"
        })),
        subtotal,
        gstAmount,
        grandTotal,
        taxPercent: Number(taxPercent) || 0,
        gstRateSelection,
        status: quoteStatus,
        notes: docNotes,
        hsnCode,
        vehicleNo,
      };

      if (editingQuoteId) {
        await updateDoc(doc(db, "quotes", editingQuoteId), quoteData);
      } else {
        await addDoc(collection(db, "quotes"), quoteData);
      }
      resetQuoteForm();
      setIsQuoteModalOpen(false);
    } catch (error) {
      console.error("Error saving quote: ", error);
      Alert.alert("Error", "Failed to save quote. Please try again.");
    }
  };

  const handleSaveInvoice = async () => {
    if (!selectedCustomerId1 || docItems.length === 0) {
      Alert.alert("Error", "Please select a customer for Party 1 and add at least one line item.");
      return;
    }
    const customer1 = customers.find(c => c.id === selectedCustomerId1);
    const customerName = customer1 ? (customer1.company || (customer1 as any).name || "Unnamed Customer") : "Unknown Customer";

    const customer2 = customers.find(c => c.id === selectedCustomerId2);
    const customerName2 = customer2 ? (customer2.company || (customer2 as any).name || "") : "";

    const subtotal = docItems.reduce((acc, item) => acc + (Number(item.rate) * Number(item.quantity)), 0);
    const gstAmount = subtotal * ((Number(taxPercent) || 0) / 100);
    let grandTotal = subtotal + gstAmount;
    if (isRoundOff) {
      grandTotal = Math.round(grandTotal);
    }

    try {
      const invoiceData = {
        invoiceNumber: docNumber,
        customerId: selectedCustomerId1,
        customerName,
        invoiceDate: docDate,
        dueDate: docExpiryOrDueDate,
        items: docItems.map(item => ({
          description: item.description,
          quantity: Number(item.quantity),
          rate: Number(item.rate),
          gstPercent: Number(taxPercent) || 0,
          amount: Number(item.rate) * Number(item.quantity),
          unit: item.unit || "Pcs"
        })),
        subtotal,
        gstAmount,
        grandTotal,
        taxPercent: Number(taxPercent) || 0,
        gstRateSelection,
        status: invoiceStatus,
        notes: docNotes,
        clientType1,
        selectedCustomerId1,
        clientType2,
        selectedCustomerId2,
        customerName2,
        isRoundOff,
        hsnCode,
        vehicleNo,
      };

      if (editingInvoiceId) {
        await updateDoc(doc(db, "invoices", editingInvoiceId), invoiceData);
      } else {
        await addDoc(collection(db, "invoices"), invoiceData);
      }
      resetInvoiceForm();
      setIsInvoiceModalOpen(false);
    } catch (error) {
      console.error("Error saving invoice: ", error);
      Alert.alert("Error", "Failed to save invoice. Please try again.");
    }
  };

  const handleEditQuote = (q: Quote) => {
    setEditingQuoteId(q.id);
    setSelectedCustomerId(q.customerId);
    setDocNumber(q.quoteNumber);
    setDocDate(q.quoteDate);
    setDocExpiryOrDueDate(q.expiryDate);
    setDocNotes(q.notes || "");
    setDocItems(q.items || []);
    setQuoteStatus(q.status);
    setTaxPercent(String((q as any).taxPercent ?? 18));
    setGstRateSelection((q as any).gstRateSelection ?? "CGST 9% + SGST 9%");
    setHsnCode(q.hsnCode || "");
    setVehicleNo(q.vehicleNo || "");
    setIsQuoteModalOpen(true);
  };

  const handleEditInvoice = (inv: Invoice) => {
    setEditingInvoiceId(inv.id);
    setSelectedCustomerId(inv.customerId);
    setSelectedCustomerId1(inv.selectedCustomerId1 || inv.customerId || "");
    setClientType1(inv.clientType1 || "Bill To");
    setSelectedCustomerId2(inv.selectedCustomerId2 || "");
    setClientType2(inv.clientType2 || "Ship To");
    setIsRoundOff(!!inv.isRoundOff);
    setDocNumber(inv.invoiceNumber);
    setDocDate(inv.invoiceDate);
    setDocExpiryOrDueDate(inv.dueDate);
    setDocNotes(inv.notes || "");
    setDocItems(inv.items || []);
    setInvoiceStatus(inv.status);
    setTaxPercent(String((inv as any).taxPercent ?? 18));
    setGstRateSelection((inv as any).gstRateSelection ?? "CGST 9% + SGST 9%");
    setHsnCode(inv.hsnCode || "");
    setVehicleNo(inv.vehicleNo || "");
    setIsInvoiceModalOpen(true);
  };

  const handleDeleteQuote = async (id: string, num: string) => {
    const confirmDelete = () => {
      deleteDoc(doc(db, "quotes", id)).catch(err => console.error("Error deleting quote:", err));
    };

    if (typeof window !== "undefined" && (window as any).confirm) {
      if ((window as any).confirm(`Are you sure you want to delete quote ${num}?`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        "Confirm Delete",
        `Are you sure you want to delete quote ${num}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: confirmDelete }
        ]
      );
    }
  };

  const handleDeleteInvoice = async (id: string, num: string) => {
    const confirmDelete = () => {
      deleteDoc(doc(db, "invoices", id)).catch(err => console.error("Error deleting invoice:", err));
    };

    if (typeof window !== "undefined" && (window as any).confirm) {
      if ((window as any).confirm(`Are you sure you want to delete invoice ${num}?`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        "Confirm Delete",
        `Are you sure you want to delete invoice ${num}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: confirmDelete }
        ]
      );
    }
  };

  const handleConvertQuoteToInvoice = async (q: Quote) => {
    try {
      const invoiceData = {
        invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
        customerId: q.customerId,
        customerName: q.customerName,
        invoiceDate: new Date().toISOString().split("T")[0],
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        items: q.items,
        subtotal: q.subtotal,
        gstAmount: q.gstAmount,
        grandTotal: q.grandTotal,
        status: "Unpaid",
        notes: q.notes || `Converted from Quote ${q.quoteNumber}`,
        clientType1: "Bill To",
        selectedCustomerId1: q.customerId,
        clientType2: "Ship To",
        selectedCustomerId2: "",
        customerName2: "",
        hsnCode: q.hsnCode || "",
        vehicleNo: q.vehicleNo || "",
      };

      await addDoc(collection(db, "invoices"), invoiceData);
      await updateDoc(doc(db, "quotes", q.id), { status: "Invoiced" });
      Alert.alert("Success", `Quote ${q.quoteNumber} converted to Invoice successfully!`);
      setActiveTab("Invoices");
    } catch (err) {
      console.error("Error converting quote:", err);
      Alert.alert("Error", "Failed to convert quote to invoice.");
    }
  };

  const handleToggleInvoicePaid = async (inv: Invoice) => {
    try {
      const newStatus = inv.status === "Paid" ? "Unpaid" : "Paid";
      await updateDoc(doc(db, "invoices", inv.id), { status: newStatus });
    } catch (err) {
      console.error("Error updating invoice status:", err);
    }
  };

  const handleGeneratePDF = (item: any, type: "Quote" | "Invoice") => {
    const docNumber = type === "Quote" ? item.quoteNumber : item.invoiceNumber;
    const rawDocDate = type === "Quote" ? item.quoteDate : item.invoiceDate;
    const docDate = formatDateToDDMMYYYY(rawDocDate);
    const primaryCustomer = customers.find(c => c.id === (type === "Quote" ? item.customerId : (item.selectedCustomerId1 || item.customerId)));
    const secondaryCustomer = type === "Invoice" && item.selectedCustomerId2 ? customers.find(c => c.id === item.selectedCustomerId2) : null;

    const clientName = primaryCustomer ? (primaryCustomer.company || (primaryCustomer as any).name || "Client") : "Client";
    const sanitizedClient = clientName.replace(/[/\\?%*:|"<>\s]/g, "_");
    const pdfFilename = `${docNumber}-${sanitizedClient}`;

    if (Platform.OS !== "web") {
      Alert.alert("PDF Export", `PDF generation for ${docNumber} initiated.`);
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      Alert.alert("Error", "Pop-up blocked. Please allow pop-ups to print PDF.");
      return;
    }

    // Set up left column parties info
    let leftColumnHtml = "";
    if (primaryCustomer) {
      leftColumnHtml += `
        <div style="font-weight: bold; font-size: 12px; margin-bottom: 2px;">${item.clientType1 || (type === "Quote" ? "To" : "Bill To")},</div>
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 2px;">${primaryCustomer.company}</div>
        <div style="font-size: 12px; font-weight: normal; line-height: 1.3; margin-bottom: 4px;">
          ${[primaryCustomer.address, primaryCustomer.locality, primaryCustomer.city, primaryCustomer.state, primaryCustomer.pincode].filter(Boolean).join(", ")}
        </div>
        ${primaryCustomer.gstin ? `<div style="font-weight: bold; font-size: 12px; margin-bottom: 8px;">GSTIN/UIN : ${primaryCustomer.gstin}</div>` : ""}
      `;
    }
    if (primaryCustomer && secondaryCustomer) {
      leftColumnHtml += `
        <div style="border-top: 1px dotted black; margin: 8px 0;"></div>
      `;
    }
    if (secondaryCustomer) {
      leftColumnHtml += `
        <div style="font-weight: bold; font-size: 12px; margin-bottom: 2px; margin-top: 4px;">${item.clientType2 || "Ship To"},</div>
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 2px;">${secondaryCustomer.company}</div>
        <div style="font-size: 12px; font-weight: normal; line-height: 1.3; margin-bottom: 4px;">
          ${[secondaryCustomer.address, secondaryCustomer.locality, secondaryCustomer.city, secondaryCustomer.state, secondaryCustomer.pincode].filter(Boolean).join(", ")}
        </div>
        ${secondaryCustomer.gstin ? `<div style="font-weight: bold; font-size: 12px; margin-bottom: 8px;">GSTIN/UIN : ${secondaryCustomer.gstin}</div>` : ""}
      `;
    }

    // Generate table rows (exactly matching item count)
    const items = item.items || [];
    let tableRowsHtml = "";
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      tableRowsHtml += `
        <tr style="border-bottom: 1px solid black; height: 35px;">
          <td style="border-right: 1px solid black; text-align: center; padding: 6px; font-size: 14px; font-weight: normal;">${i + 1}</td>
          <td style="border-right: 1px solid black; padding: 6px; text-align: left; font-size: 14px; font-weight: normal;">${it.description}</td>
          <td style="border-right: 1px solid black; text-align: center; padding: 6px; font-size: 14px; font-weight: normal;">${it.quantity}</td>
          <td style="border-right: 1px solid black; text-align: right; padding: 6px; font-size: 14px; font-weight: normal;">${it.rate.toFixed(2)}</td>
          <td style="border-right: 1px solid black; text-align: center; padding: 6px; font-size: 14px; font-weight: normal;">${it.unit || 'Pcs'}</td>
          <td style="text-align: right; padding: 6px; font-size: 14px; font-weight: normal;">${it.amount.toFixed(2)}</td>
        </tr>
      `;
    }

    // Prepare header logo HTML
    const logoAsset = require("../assets/images/logo.png");
    const resolvedLogoUrl = myLogoUrl || (typeof logoAsset === "string" ? logoAsset : (logoAsset?.uri || logoAsset?.default || ""));
    const logoHtml = `<img src="${resolvedLogoUrl}" style="max-height: 70px; max-width: 100%; object-fit: contain;" />`;

    const gstNoHtml = myGstin
      ? `<tr>
          <td colspan="2" style="border-top: 1px solid black; padding: 6px 8px; font-weight: bold; font-size: 13px; text-align: left;">
            GST No : ${myGstin}
          </td>
        </tr>`
      : "";

    const hsnHtml = item.hsnCode
      ? `<div><strong>HSN Code : </strong> ${item.hsnCode}</div>`
      : "";

    const vehicleHtml = item.vehicleNo
      ? `<div><strong>Vehicle No : </strong> ${item.vehicleNo}</div>`
      : "";

    let gstRowsHtml = "";
    if (item.gstRateSelection === "CGST 9% + SGST 9%") {
      gstRowsHtml = `
        <tr style="border-bottom: 1px solid black;">
          <td style="padding: 5px; border-right: 1px solid black;">SGST @ 9%</td>
          <td style="padding: 5px; text-align: right;">${(item.subtotal * 0.09).toFixed(2)}</td>
        </tr>
        <tr style="border-bottom: 1px solid black;">
          <td style="padding: 5px; border-right: 1px solid black;">CGST @ 9%</td>
          <td style="padding: 5px; text-align: right;">${(item.subtotal * 0.09).toFixed(2)}</td>
        </tr>
        <tr style="border-bottom: 1px solid black; height: 25px;">
          <td style="padding: 5px; border-right: 1px solid black;">IGST @ 18%</td>
          <td style="padding: 5px; text-align: right;">&nbsp;</td>
        </tr>
      `;
    } else if (item.gstRateSelection === "IGST 18%") {
      gstRowsHtml = `
        <tr style="border-bottom: 1px solid black; height: 25px;">
          <td style="padding: 5px; border-right: 1px solid black;">SGST @ 9%</td>
          <td style="padding: 5px; text-align: right;">&nbsp;</td>
        </tr>
        <tr style="border-bottom: 1px solid black; height: 25px;">
          <td style="padding: 5px; border-right: 1px solid black;">CGST @ 9%</td>
          <td style="padding: 5px; text-align: right;">&nbsp;</td>
        </tr>
        <tr style="border-bottom: 1px solid black;">
          <td style="padding: 5px; border-right: 1px solid black;">IGST @ 18%</td>
          <td style="padding: 5px; text-align: right;">${(item.subtotal * 0.18).toFixed(2)}</td>
        </tr>
      `;
    } else {
      gstRowsHtml = `
        <tr style="border-bottom: 1px solid black; height: 25px;">
          <td style="padding: 5px; border-right: 1px solid black;">SGST @ 0%</td>
          <td style="padding: 5px; text-align: right;">&nbsp;</td>
        </tr>
        <tr style="border-bottom: 1px solid black; height: 25px;">
          <td style="padding: 5px; border-right: 1px solid black;">CGST @ 0%</td>
          <td style="padding: 5px; text-align: right;">&nbsp;</td>
        </tr>
        <tr style="border-bottom: 1px solid black; height: 25px;">
          <td style="padding: 5px; border-right: 1px solid black;">IGST @ 0%</td>
          <td style="padding: 5px; text-align: right;">&nbsp;</td>
        </tr>
      `;
    }

    const companyNameUpper = myCompanyName.toUpperCase();
    const amountInWordsStr = toIndianWords(item.grandTotal);
    const termsStr = myTerms || item.notes || "";

    printWindow.document.write(`
      <html>
        <head>
          <title>${type} - ${docNumber}</title>
          <style>
            * { box-sizing: border-box; }
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            body { 
              font-family: Arial, sans-serif; 
              color: #000; 
              margin: 0; 
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .double-container {
              border: 3px double black;
              padding: 4px;
              width: 100%;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="double-container">  

            <!-- Header Table -->
            <table style="border: 1px solid black; border-bottom: none;">
              <tr>
                <td style="width: 25%; border-right: 1px solid black; padding: 10px; text-align: center; vertical-align: middle;">
                  ${logoHtml}
                </td>
                <td style="width: 75%; background: #548eeb; color: black; font-family: Arial, sans-serif; font-size: 35px; font-weight: 700; text-align: center; vertical-align: middle; letter-spacing: 1px; padding: 12px;">
                  ${companyNameUpper}
                </td>
              </tr>
              <tr>
                <td colspan="2" style="border-top: 1px solid black; text-align: center; padding: 6px; font-weight: bold; font-size: 12px;">
                  <div style="margin-bottom: 2px;font-size: 13px;">${myAddress}</div>
                  <div style="font-size: 12px; font-weight: normal; margin-bottom: 2px;">Email : ${myEmail} &nbsp;&nbsp;&nbsp; Mobile No. : ${myMobile}</div>
                  ${myGstin ? `<div style="font-size: 13px; border-top: 1px #ccc; padding-top: 4px; margin-top: 4px;">GSTIN No : ${myGstin}</div>` : ""}
                </td>
              </tr>
            </table>

            <!-- Doc Title -->
            <table style="border: 1px solid black; border-bottom: none;">
              <tr>
                <td style="text-align: center; font-weight: bold; font-size: 14px; padding: 4px; border-top: 1px solid black; letter-spacing: 1px;">
                  ${type === "Quote" ? "Quotation" : "Tax Invoice"}
                </td>
              </tr>
            </table>

            <!-- Metadata Parties Box -->
            <table style="border: 1px solid black; border-bottom: none;">
              <tr>
                <td style="width: 60%; border-right: 1px solid black; padding: 8px; vertical-align: top; font-size: 12px; font-weight: bold;">
                  ${leftColumnHtml}
                </td>
                <td style="width: 40%; padding: 8px; vertical-align: top; font-size: 12px; line-height: 1.6;">
                  <div><strong>${type === "Quote" ? "Quotation Date" : "Invoice Date"} : </strong> ${docDate}</div>
                  <div><strong>${type === "Quote" ? "Quotation No" : "Invoice No"} : </strong> ${docNumber}</div>
                  ${hsnHtml}
                  ${vehicleHtml}
                </td>
              </tr>
            </table>

            <!-- Items Table -->
            <table style="border: 1px solid black;">
              <thead>
                <tr style="border-bottom: 1px solid black; font-size: 11px; font-weight: bold; height: 30px;">
                  <th style="border-right: 1px solid black; width: 8%; padding: 4px; text-align: center;">SR. No.</th>
                  <th style="border-right: 1px solid black; width: 48%; padding: 4px; text-align: center;">DESCRIPTION</th>
                  <th style="border-right: 1px solid black; width: 10%; padding: 4px; text-align: center;">QTY</th>
                  <th style="border-right: 1px solid black; width: 12%; padding: 4px; text-align: center;">RATE</th>
                  <th style="border-right: 1px solid black; width: 10%; padding: 4px; text-align: center;">UNIT</th>
                  <th style="width: 12%; padding: 4px; text-align: center;">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
              </tbody>
            </table>

            <!-- Bottom Totals, Bank, Words, Terms -->
            <table style="border: 1px solid black;">
              <tr>
                <td style="width: 60%; border-right: 1px solid black; vertical-align: top; font-size: 11px; padding: 0;">
                  <div style="border-bottom: 1px solid black; padding: 6px;">
                    <div style="font-weight: bold; margin-bottom: 4px;">AMOUNT IN WORDS :</div>
                    <div style="background-color: yellow; padding: 3px 6px; font-weight: bold; font-size: 14px; display: inline-block; border: 1px solid #aaa;">
                      ${amountInWordsStr}
                    </div>
                  </div>
                  
                  <div style="border-bottom: 1px solid black; padding: 6px; line-height: 1.4;">
                    <div style="font-weight: bold; font-size: 11px; margin-bottom: 4px;">BANK ACCOUNT DETAILS :</div>
                    <div>BANK NAME : ${myBankName || "AXIS BANK"}</div>
                    <div>ACCOUNT NO : ${myBankAccountNo || "921020057527491"}</div>
                    <div>IFSC CODE : ${myBankIfsc || "UTIB0003655"}</div>
                  </div>
                  
                  <div style="padding: 6px;">
                    <div style="font-weight: bold; margin-bottom: 3px; font-size: 11px;">TERMS & CONDITIONS :</div>
                    <div style="font-size: 11px; font-weight: normal; line-height: 1.3; white-space: pre-line;">${termsStr}</div>
                  </div>
                </td>
                
                <td style="width: 40%; vertical-align: top; padding: 0;">
                  <table style="width: 100%; border-collapse: collapse;font-size: 14px;">
                    <tr style="border-bottom: 1px solid black;">
                      <td style="padding: 5px; font-size: 14px; font-weight: bold; border-right: 1px solid black; width: 60%;">GROSS AMOUNT</td>
                      <td style="padding: 5px;font-size: 14px; font-weight: bold; text-align: right; width: 40%;">${item.subtotal.toFixed(2)}</td>
                    </tr>
                    ${gstRowsHtml}
                    <tr style="border-bottom: 1px solid black; font-size: 12px;">
                      <td style="padding: 5px; font-size: 14px; font-weight: bold; border-right: 1px solid black;">TOTAL AMOUNT</td>
                      <td style="padding: 5px;font-size: 14px; font-weight: bold; text-align: right;">${item.grandTotal.toFixed(2)}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid black; background-color: yellow; font-size: 13px;">
                      <td style="padding: 5px; font-size: 14px; font-weight: bold; border-right: 1px solid black;">TOTAL AMOUNT</td>
                      <td style="padding: 5px;font-size: 14px; font-weight: bold; text-align: right;">${item.grandTotal.toFixed(2)}</td>
                    </tr>
                  </table>
                  
                  <div style="padding: 10px; text-align: right; min-height: 90px; display: flex; flex-direction: column; justify-content: space-between;">
                    <div style="font-weight: bold; font-size: 11px;">For, ${companyNameUpper}</div>
                    <div style="font-weight: bold; font-size: 11px; margin-top: auto; border-top: 1px dotted #888; display: inline-block; padding-top: 4px; text-align: right; align-self: flex-end;">Authorised Signatory</div>
                  </div>
                </td>
              </tr>
            </table>
          </div>

          <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
          <script>
            window.onload = function() {
              const element = document.querySelector('.double-container');
              const opt = {
                margin:       [10, 10, 10, 10],
                filename:     '${type}-${pdfFilename}.pdf',
                image:        { type: 'png', quality: 1 },
                html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
              };
              
              html2pdf().set(opt).from(element).save().then(function() {
                setTimeout(function() {
                  window.close();
                }, 1000);
              });
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const filteredCustomers = customers.filter(
    (c) =>
      (c.company || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.personName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.gstin || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.locality || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.city || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.state || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredQuotes = quotes.filter(
    (q) =>
      (q.quoteNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.customerName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.status || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredInvoices = invoices.filter(
    (inv) =>
      (inv.invoiceNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.customerName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.customerName2 || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.status || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addLineItem = () => {
    setDocItems([...docItems, { description: "", quantity: 1, rate: 0, gstPercent: 18, amount: 0, unit: "Pcs" }]);
  };

  const removeLineItem = (index: number) => {
    const updated = docItems.filter((_, i) => i !== index);
    setDocItems(updated.length > 0 ? updated : [{ description: "", quantity: 1, rate: 0, gstPercent: 18, amount: 0, unit: "Pcs" }]);
  };

  const updateLineItem = (index: number, key: keyof LineItem, value: any) => {
    const updated = [...docItems];
    updated[index] = {
      ...updated[index],
      [key]: value,
    };

    const qty = key === "quantity" ? Number(value) : Number(updated[index].quantity);
    const rate = key === "rate" ? Number(value) : Number(updated[index].rate);
    updated[index].amount = qty * rate;

    setDocItems(updated);
  };

  const sidebarItems = [
    { name: "Home", icon: "home-outline" as const },
    { name: "Customers", icon: "people-outline" as const },
    { name: "Quotes", icon: "document-text-outline" as const },
    { name: "Invoices", icon: "receipt-outline" as const },
  ];

  const renderSidebarContent = () => (
    <View className="h-full bg-[#1e2235] p-4 flex flex-col justify-between">
      <View>
        {/* Brand Header */}
        <View className="flex-row items-center mb-8 px-2 space-x-2">
          <MaterialIcons name="receipt" size={28} color="#ffffff" />
          <Text className="text-white font-bold text-xl ml-2">V.S Invoice</Text>
        </View>

        {/* Sidebar Nav Items */}
        <View className="space-y-1">
          {sidebarItems.map((item) => {
            const isActive = activeTab === item.name;
            return (
              <TouchableOpacity
                key={item.name}
                onPress={() => {
                  setActiveTab(item.name);
                  setIsSidebarMobileOpen(false);
                }}
                className={`flex-row items-center px-3 py-3 rounded-lg ${isActive ? "bg-[#3b82f6]" : "hover:bg-[#2d324f]"
                  }`}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={isActive ? "#ffffff" : "#94a3b8"}
                />
                <Text
                  className={`ml-3 font-medium ${isActive ? "text-white" : "text-[#94a3b8]"
                    }`}
                >
                  {item.name}
                </Text>
                {item.name === "Customers" && (
                  <View className="ml-auto bg-blue-500/30 px-1.5 py-0.5 rounded">
                    <Ionicons name="add" size={14} color="#ffffff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Footer Settings */}
      <View className="border-t border-slate-700 pt-4 space-y-2">
        <TouchableOpacity
          onPress={() => setIsMyDetailsModalOpen(true)}
          className="flex-row items-center px-3 py-2.5 rounded-lg bg-slate-800/50"
        >
          <Ionicons name="settings-outline" size={20} color="#94a3b8" />
          <Text className="text-[#94a3b8] ml-3 font-medium">My details</Text>
          <Ionicons name="chevron-forward" size={16} color="#94a3b8" className="ml-auto" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-[#0f172a] justify-center items-center p-6">
        <View className="w-full max-w-sm bg-[#1e293b] p-8 rounded-3xl border border-slate-700/50 shadow-2xl items-center">
          {/* Logo / Lock Icon */}
          <View className="w-16 h-16 bg-blue-600 rounded-full justify-center items-center mb-6 shadow-lg shadow-blue-500/30">
            <Ionicons name="lock-closed" size={28} color="#ffffff" />
          </View>

          <Text className="text-white text-xl font-bold mb-1">Enter Security PIN</Text>
          <Text className="text-slate-400 text-xs text-center mb-6">Access to V S Enterprise Invoice System</Text>

          {/* PIN Dots */}
          <View className="flex-row space-x-4 mb-4">
            {[0, 1, 2, 3].map((index) => {
              const filled = pin.length > index;
              return (
                <View
                  key={index}
                  className={`w-4 h-4 rounded-full border ${filled
                    ? "bg-blue-500 border-blue-500 shadow-md shadow-blue-500/50"
                    : "border-slate-500 bg-transparent"
                    }`}
                />
              );
            })}
          </View>

          {/* Error Message */}
          <View className="h-6 justify-center mb-4">
            {pinError ? (
              <Text className="text-red-400 text-xs font-semibold">{pinError}</Text>
            ) : null}
          </View>

          {/* Keypad Grid */}
          <View className="w-full space-y-4">
            {/* Row 1 */}
            <View className="flex-row justify-between px-4">
              {["1", "2", "3"].map((num) => (
                <TouchableOpacity
                  key={num}
                  onPress={() => handleKeyPress(num)}
                  className="w-14 h-14 bg-slate-800 rounded-full justify-center items-center border border-slate-700/20 active:bg-slate-700 active:scale-95"
                >
                  <Text className="text-white text-xl font-bold">{num}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Row 2 */}
            <View className="flex-row justify-between px-4">
              {["4", "5", "6"].map((num) => (
                <TouchableOpacity
                  key={num}
                  onPress={() => handleKeyPress(num)}
                  className="w-14 h-14 bg-slate-800 rounded-full justify-center items-center border border-slate-700/20 active:bg-slate-700 active:scale-95"
                >
                  <Text className="text-white text-xl font-bold">{num}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Row 3 */}
            <View className="flex-row justify-between px-4">
              {["7", "8", "9"].map((num) => (
                <TouchableOpacity
                  key={num}
                  onPress={() => handleKeyPress(num)}
                  className="w-14 h-14 bg-slate-800 rounded-full justify-center items-center border border-slate-700/20 active:bg-slate-700 active:scale-95"
                >
                  <Text className="text-white text-xl font-bold">{num}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Row 4 */}
            <View className="flex-row justify-between px-4 items-center">
              {/* Clear */}
              <TouchableOpacity
                onPress={() => {
                  setPin("");
                  setPinError("");
                }}
                className="w-14 h-14 rounded-full justify-center items-center active:scale-95"
              >
                <Text className="text-slate-400 text-xs font-semibold">Clear</Text>
              </TouchableOpacity>

              {/* Zero */}
              <TouchableOpacity
                onPress={() => handleKeyPress("0")}
                className="w-14 h-14 bg-slate-800 rounded-full justify-center items-center border border-slate-700/20 active:bg-slate-700 active:scale-95"
              >
                <Text className="text-white text-xl font-bold">0</Text>
              </TouchableOpacity>

              {/* Backspace */}
              <TouchableOpacity
                onPress={handleBackspace}
                className="w-14 h-14 rounded-full justify-center items-center active:scale-95"
              >
                <Ionicons name="backspace-outline" size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#f8fafc] flex-row">
      {/* 1. DESKTOP SIDEBAR */}
      {isLargeScreen && (
        <View className="w-64 h-full border-r border-slate-200">
          {renderSidebarContent()}
        </View>
      )}

      {/* 2. MOBILE DRAWER OVERLAY */}
      {!isLargeScreen && isSidebarMobileOpen && (
        <Modal
          transparent={true}
          animationType="fade"
          visible={isSidebarMobileOpen}
          onRequestClose={() => setIsSidebarMobileOpen(false)}
        >
          <View className="flex-1 flex-row">
            <View className="w-64 h-full bg-[#1e2235]">
              {renderSidebarContent()}
            </View>
            <TouchableOpacity
              className="flex-1 bg-black/40"
              onPress={() => setIsSidebarMobileOpen(false)}
            />
          </View>
        </Modal>
      )}

      {/* 3. MAIN CONTENT CONTAINER */}
      <View className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header Bar */}
        <View className="bg-white border-b border-slate-200 h-16 px-4 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 max-w-lg">
            {!isLargeScreen && (
              <TouchableOpacity
                onPress={() => setIsSidebarMobileOpen(true)}
                className="mr-3 p-1 rounded-lg hover:bg-slate-100"
              >
                <Feather name="menu" size={24} color="#475569" />
              </TouchableOpacity>
            )}

            {/* Search Input */}
            <View className="flex-row items-center bg-slate-100 rounded-lg px-3 py-2 flex-1">
              <Ionicons name="search-outline" size={18} color="#64748b" />
              <TextInput
                placeholder={`Search In ${activeTab} (/)`}
                className="ml-2 text-sm text-slate-800 flex-1 outline-none"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>

          {/* Quick Action Icons removed as requested */}
        </View>

        {/* Dynamic Content Panel */}
        <ScrollView className="flex-1 p-6" contentContainerStyle={{ paddingBottom: 40 }}>
          {activeTab === "Customers" ? (
            <View>
              {/* Customers Header */}
              <View className="flex-row items-center justify-between mb-6">
                <View className="flex-row items-center">
                  <Text className="text-2xl font-bold text-slate-800">All Customers</Text>
                  <TouchableOpacity className="ml-1.5 mt-1">
                    <Ionicons name="chevron-down" size={18} color="#334155" />
                  </TouchableOpacity>
                </View>

                <View className="flex-row items-center space-x-2">
                  <TouchableOpacity
                    onPress={() => { resetForm(); setIsModalOpen(true); }}
                    className="bg-blue-600 flex-row items-center px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700"
                  >
                    <Ionicons name="add" size={18} color="#ffffff" />
                    <Text className="text-white font-semibold ml-1.5">New</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="bg-white border border-slate-200 p-2 rounded-lg hover:bg-slate-50">
                    <Feather name="more-horizontal" size={18} color="#64748b" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* EMPTY STATE */}
              {filteredCustomers.length === 0 ? (
                <View className="flex-1 items-center justify-center py-12">
                  {/* Decorative Icon Graphic */}
                  <View className="relative w-28 h-28 items-center justify-center mb-6">
                    <View className="absolute inset-0 bg-slate-100 rounded-full opacity-60" />
                    <View className="w-20 h-20 bg-slate-200 rounded-full items-center justify-center">
                      <Ionicons name="person" size={42} color="#94a3b8" />
                    </View>
                    <View className="absolute bottom-2 right-2 bg-blue-500 w-8 h-8 rounded-full border-4 border-white items-center justify-center">
                      <Ionicons name="add" size={16} color="#ffffff" />
                    </View>
                  </View>

                  <Text className="text-xl font-bold text-slate-800 mb-2">
                    Every sales starts with a customer
                  </Text>
                  <Text className="text-slate-500 text-center max-w-md mb-6 px-4">
                    Create and manage your customers and their contact persons, all in one place.
                  </Text>

                  {/* Buttons */}
                  <View className="flex-row items-center space-x-3 mb-8">
                    <TouchableOpacity
                      onPress={() => { resetForm(); setIsModalOpen(true); }}
                      className="bg-blue-600 px-5 py-2.5 rounded-lg shadow-sm hover:bg-blue-700"
                    >
                      <Text className="text-white font-semibold">+ Create New Customer</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* ACTIVE CUSTOMERS LIST */
                <View className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <View className="p-4 bg-slate-50 border-b border-slate-200 flex-row justify-between items-center">
                    <Text className="text-sm font-semibold text-slate-500">Customer Details</Text>
                    <Text className="text-sm font-semibold text-slate-500">Actions</Text>
                  </View>
                  <View className="divide-y divide-slate-100">
                    {filteredCustomers.map((c) => (
                      <View key={c.id} className="p-4 flex-row items-center justify-between hover:bg-slate-50">
                        <View className="flex-row items-center space-x-3 flex-1 min-w-0 mr-4">
                          <View className="w-10 h-10 rounded-full bg-blue-100 items-center justify-center flex-shrink-0">
                            <Text className="text-blue-700 font-bold text-sm">
                              {((c.company || (c as any).name || c.personName || "U").charAt(0)).toUpperCase()}
                            </Text>
                          </View>
                          <View className="ml-3 flex-1 min-w-0">
                            <Text className="font-semibold text-slate-800 truncate" numberOfLines={1}>
                              {c.company || (c as any).name || "Unnamed Customer"}
                            </Text>
                            {c.personName ? <Text className="text-slate-500 text-xs font-medium truncate" numberOfLines={1}>Contact: {c.personName}</Text> : null}
                            <View className="flex flex-col md:flex-row md:items-center mt-1 space-y-1 md:space-y-0 md:space-x-2">
                              {c.email ? <Text className="text-slate-400 text-xs truncate" numberOfLines={1}>{c.email}</Text> : null}
                              {c.email && c.phone ? <Text className="text-slate-300 text-xs hidden md:inline">|</Text> : null}
                              {c.phone ? <Text className="text-slate-400 text-xs truncate" numberOfLines={1}>{c.phone}</Text> : null}
                              {(c.email || c.phone) && c.gstin ? <Text className="text-slate-300 text-xs hidden md:inline">|</Text> : null}
                              {c.gstin ? <Text className="text-slate-400 text-xs truncate" numberOfLines={1}>GSTIN: {c.gstin}</Text> : null}
                              {((c.email || c.phone || c.gstin) && (c.address || c.locality || c.city || c.state || c.pincode)) ? <Text className="text-slate-300 text-xs hidden md:inline">|</Text> : null}
                              {(c.address || c.locality || c.city || c.state || c.pincode) ? (
                                <Text className="text-slate-400 text-xs" numberOfLines={2}>
                                  Addr: {[c.address, c.locality, c.city, c.state, c.pincode].filter(Boolean).join(", ")}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        </View>
                        <View className="flex-col items-center gap-2">
                          <TouchableOpacity
                            onPress={() => handleEditCustomer(c)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100"
                          >
                            <Feather name="edit-2" size={14} color="#475569" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteCustomer(c.id, c.company || (c as any).name || "this customer")}
                            className="p-1.5 rounded-lg border border-red-100 hover:bg-red-50"
                          >
                            <Feather name="trash-2" size={14} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ) : activeTab === "Quotes" ? (
            <View>
              {/* Quotes Header */}
              <View className="flex-row items-center justify-between mb-6">
                <View className="flex-row items-center">
                  <Text className="text-2xl font-bold text-slate-800">All Quotes</Text>
                  <TouchableOpacity className="ml-1.5 mt-1">
                    <Ionicons name="chevron-down" size={18} color="#334155" />
                  </TouchableOpacity>
                </View>

                <View className="flex-row items-center space-x-2">
                  <TouchableOpacity
                    onPress={() => { resetQuoteForm(); setIsQuoteModalOpen(true); }}
                    className="bg-blue-600 flex-row items-center px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700"
                  >
                    <Ionicons name="add" size={18} color="#ffffff" />
                    <Text className="text-white font-semibold ml-1.5">New Quote</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* EMPTY STATE */}
              {filteredQuotes.length === 0 ? (
                <View className="flex-1 items-center justify-center py-12">
                  <View className="relative w-28 h-28 items-center justify-center mb-6">
                    <View className="absolute inset-0 bg-slate-100 rounded-full opacity-60" />
                    <View className="w-20 h-20 bg-slate-200 rounded-full items-center justify-center">
                      <Ionicons name="document-text" size={42} color="#94a3b8" />
                    </View>
                  </View>

                  <Text className="text-xl font-bold text-slate-800 mb-2">
                    No quotes created yet
                  </Text>
                  <Text className="text-slate-500 text-center max-w-md mb-6 px-4">
                    Generate professional quotes and convert them to invoices with a single click.
                  </Text>

                  <TouchableOpacity
                    onPress={() => { resetQuoteForm(); setIsQuoteModalOpen(true); }}
                    className="bg-blue-600 px-5 py-2.5 rounded-lg shadow-sm hover:bg-blue-700"
                  >
                    <Text className="text-white font-semibold">+ Create New Quote</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* QUOTES LIST */
                <View className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <View className="p-4 bg-slate-50 border-b border-slate-200 flex-row justify-between items-center">
                    <Text className="text-sm font-semibold text-slate-500">Quote Details</Text>
                    <Text className="text-sm font-semibold text-slate-500">Actions</Text>
                  </View>
                  <View className="divide-y divide-slate-100">
                    {filteredQuotes.map((q) => {
                      return (
                        <View key={q.id} className="p-4 flex-row items-center justify-between hover:bg-slate-50">
                          <View className="flex-1 min-w-0 mr-4">
                            <View className="flex-row items-center space-x-2">
                              <Text className="font-bold text-blue-600 text-sm">{q.quoteNumber}</Text>
                              <View className={`px-2 py-0.5 rounded text-xs font-semibold ${q.status === "Invoiced" ? "bg-green-100 text-green-700" :
                                q.status === "Approved" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"
                                }`}>
                                <Text className="text-xs">{q.status}</Text>
                              </View>
                            </View>
                            <Text className="font-semibold text-slate-800 mt-1 truncate">{q.customerName}</Text>
                            <View className="flex-row items-center mt-1 space-x-2">
                              <Text className="text-slate-400 text-xs">Date: {formatDateToDDMMYYYY(q.quoteDate)}</Text>
                            </View>
                          </View>
                          <View className="flex-row items-center space-x-4">
                            <Text className="font-bold text-slate-800 text-base">₹{q.grandTotal.toFixed(2)}</Text>
                            <View className="flex-col items-center gap-2">
                              <TouchableOpacity
                                onPress={() => handleGeneratePDF(q, "Quote")}
                                className="p-1.5 rounded-lg border border-blue-200 hover:bg-blue-50"
                              >
                                <MaterialCommunityIcons name="file-pdf-box" size={14} color="#ef4444" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleEditQuote(q)}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100"
                              >
                                <Feather name="edit-2" size={14} color="#475569" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleDeleteQuote(q.id, q.quoteNumber)}
                                className="p-1.5 rounded-lg border border-red-100 hover:bg-red-50"
                              >
                                <Feather name="trash-2" size={14} color="#ef4444" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          ) : activeTab === "Invoices" ? (
            <View>
              {/* Invoices Header */}
              <View className="flex-row items-center justify-between mb-6">
                <View className="flex-row items-center">
                  <Text className="text-2xl font-bold text-slate-800">All Invoices</Text>
                  <TouchableOpacity className="ml-1.5 mt-1">
                    <Ionicons name="chevron-down" size={18} color="#334155" />
                  </TouchableOpacity>
                </View>

                <View className="flex-row items-center space-x-2">
                  <TouchableOpacity
                    onPress={() => { resetInvoiceForm(); setIsInvoiceModalOpen(true); }}
                    className="bg-blue-600 flex-row items-center px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700"
                  >
                    <Ionicons name="add" size={18} color="#ffffff" />
                    <Text className="text-white font-semibold ml-1.5">New Invoice</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* EMPTY STATE */}
              {filteredInvoices.length === 0 ? (
                <View className="flex-1 items-center justify-center py-12">
                  <View className="relative w-28 h-28 items-center justify-center mb-6">
                    <View className="absolute inset-0 bg-slate-100 rounded-full opacity-60" />
                    <View className="w-20 h-20 bg-slate-200 rounded-full items-center justify-center">
                      <Ionicons name="receipt" size={42} color="#94a3b8" />
                    </View>
                  </View>

                  <Text className="text-xl font-bold text-slate-800 mb-2">
                    No invoices created yet
                  </Text>
                  <Text className="text-slate-500 text-center max-w-md mb-6 px-4">
                    Send invoices to your clients and track when they pay you.
                  </Text>

                  <TouchableOpacity
                    onPress={() => { resetInvoiceForm(); setIsInvoiceModalOpen(true); }}
                    className="bg-blue-600 px-5 py-2.5 rounded-lg shadow-sm hover:bg-blue-700"
                  >
                    <Text className="text-white font-semibold">+ Create New Invoice</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* INVOICES LIST */
                <View className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <View className="p-4 bg-slate-50 border-b border-slate-200 flex-row justify-between items-center">
                    <Text className="text-sm font-semibold text-slate-500">Invoice Details</Text>
                    <Text className="text-sm font-semibold text-slate-500">Actions</Text>
                  </View>
                  <View className="divide-y divide-slate-100">
                    {filteredInvoices.map((inv) => {
                      return (
                        <View key={inv.id} className="p-4 flex-row items-center justify-between hover:bg-slate-50">
                          <View className="flex-1 min-w-0 mr-4">
                            <View className="flex-row items-center space-x-2">
                              <Text className="font-bold text-blue-600 text-sm">{inv.invoiceNumber}</Text>
                              <View className={`px-2 py-0.5 rounded text-xs font-semibold ${inv.status === "Paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                <Text className="text-xs">{inv.status}</Text>
                              </View>
                            </View>
                            <Text className="font-semibold text-slate-800 mt-1 truncate">{inv.customerName}</Text>
                            {inv.clientType1 ? (
                              <View className="mt-1 flex-col space-y-0.5">
                                <Text className="text-[11px] text-slate-500 font-medium">
                                  <Text className="font-bold text-slate-700">{inv.clientType1}:</Text> {inv.customerName}
                                </Text>
                                {inv.clientType2 && inv.customerName2 ? (
                                  <Text className="text-[11px] text-slate-500 font-medium">
                                    <Text className="font-bold text-slate-700">{inv.clientType2}:</Text> {inv.customerName2}
                                  </Text>
                                ) : null}
                              </View>
                            ) : null}
                            <View className="flex-row items-center mt-1 space-x-2">
                              <Text className="text-slate-400 text-xs">Date: {formatDateToDDMMYYYY(inv.invoiceDate)}</Text>
                            </View>
                          </View>
                          <View className="flex-row items-center space-x-4">
                            <Text className="font-bold text-slate-800 text-base">₹{inv.grandTotal.toFixed(2)}</Text>
                            <View className="flex-col items-center gap-2">
                              <TouchableOpacity
                                onPress={() => handleToggleInvoicePaid(inv)}
                                className={`p-1.5 rounded-lg border ${inv.status === "Paid" ? "border-green-300 bg-green-50" : "border-slate-200 hover:bg-slate-100"
                                  }`}
                              >
                                <MaterialCommunityIcons name="cash-check" size={14} color={inv.status === "Paid" ? "#16a34a" : "#475569"} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleGeneratePDF(inv, "Invoice")}
                                className="p-1.5 rounded-lg border border-blue-200 hover:bg-blue-50"
                              >
                                <MaterialCommunityIcons name="file-pdf-box" size={14} color="#ef4444" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleEditInvoice(inv)}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100"
                              >
                                <Feather name="edit-2" size={14} color="#475569" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleDeleteInvoice(inv.id, inv.invoiceNumber)}
                                className="p-1.5 rounded-lg border border-red-100 hover:bg-red-50"
                              >
                                <Feather name="trash-2" size={14} color="#ef4444" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          ) : (
            /* HOME / DASHBOARD TAB */
            <View>
              <View className="mb-6">
                <Text className="text-2xl font-bold text-slate-800">Business Dashboard</Text>
                <Text className="text-slate-500 text-sm mt-1">Here is a quick overview of your invoicing and financials.</Text>
              </View>

              {/* Stats Cards Row */}
              <View className="flex flex-row flex-wrap -mx-2 mb-6">
                {/* Card 1 */}
                <View className="w-full sm:w-1/2 lg:w-1/4 px-2 mb-4">
                  <View className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className="text-slate-500 text-xs font-semibold uppercase">Total Sales (Paid)</Text>
                      <View className="bg-green-100 p-1.5 rounded-lg">
                        <Ionicons name="cash-outline" size={18} color="#16a34a" />
                      </View>
                    </View>
                    <Text className="text-2xl font-bold text-slate-800">
                      ₹{invoices.filter(i => i.status === "Paid").reduce((sum, i) => sum + i.grandTotal, 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Card 2 */}
                <View className="w-full sm:w-1/2 lg:w-1/4 px-2 mb-4">
                  <View className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className="text-slate-500 text-xs font-semibold uppercase">Pending Receivables</Text>
                      <View className="bg-yellow-100 p-1.5 rounded-lg">
                        <Ionicons name="hourglass-outline" size={18} color="#ca8a04" />
                      </View>
                    </View>
                    <Text className="text-2xl font-bold text-slate-800">
                      ₹{invoices.filter(i => i.status !== "Paid" && i.status !== "Draft" && i.status !== "Cancelled").reduce((sum, i) => sum + i.grandTotal, 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Card 3 */}
                <View className="w-full sm:w-1/2 lg:w-1/4 px-2 mb-4">
                  <View className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className="text-slate-500 text-xs font-semibold uppercase">Quotes Issued</Text>
                      <View className="bg-blue-100 p-1.5 rounded-lg">
                        <Ionicons name="document-text-outline" size={18} color="#2563eb" />
                      </View>
                    </View>
                    <Text className="text-2xl font-bold text-slate-800">{quotes.length}</Text>
                  </View>
                </View>

                {/* Card 4 */}
                <View className="w-full sm:w-1/2 lg:w-1/4 px-2 mb-4">
                  <View className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className="text-slate-500 text-xs font-semibold uppercase">Total Customers</Text>
                      <View className="bg-indigo-100 p-1.5 rounded-lg">
                        <Ionicons name="people-outline" size={18} color="#4f46e5" />
                      </View>
                    </View>
                    <Text className="text-2xl font-bold text-slate-800">{customers.length}</Text>
                  </View>
                </View>
              </View>

              {/* Quick Navigation / Call to Actions */}
              <View className="bg-blue-600 rounded-2xl p-6 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center">
                <View className="mb-4 md:mb-0">
                  <Text className="text-white text-lg font-bold">Need to issue an invoice?</Text>
                  <Text className="text-blue-100 text-sm mt-1">Quickly create professional invoices and collect payments instantly.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => { resetInvoiceForm(); setIsInvoiceModalOpen(true); }}
                  className="bg-white px-5 py-2.5 rounded-lg shadow-md"
                >
                  <Text className="text-blue-600 font-bold">+ New Invoice</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </View>

      {/* 4. MODAL: CREATE CUSTOMER */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 p-4">
          <View className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-slate-800">
                {editingCustomerId ? "Edit Customer Details" : "Add New Customer"}
              </Text>
              <TouchableOpacity onPress={() => { resetForm(); setIsModalOpen(false); }}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Form Fields */}
            <ScrollView className="max-h-[60vh] space-y-4 pr-1" showsVerticalScrollIndicator={true}>
              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Company Name *
                </Text>
                <TextInput
                  placeholder="e.g. Acme Corp"
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={company}
                  onChangeText={setCompany}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  GSTIN No.
                </Text>
                <TextInput
                  placeholder="e.g. 22AAAAA0000A1Z5"
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={gstin}
                  onChangeText={setGstin}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Email
                </Text>
                <TextInput
                  placeholder="e.g. contact@company.com"
                  keyboardType="email-address"
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Mobile No.
                </Text>
                <TextInput
                  placeholder="e.g. +91 9999999999"
                  keyboardType="phone-pad"
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Address
                </Text>
                <TextInput
                  placeholder="e.g. 123 Main Street"
                  multiline={true}
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={address}
                  onChangeText={setAddress}
                  style={{ minHeight: 60 }}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Pincode
                </Text>
                <TextInput
                  placeholder="e.g. 380001"
                  keyboardType="numeric"
                  className={`bg-slate-50 border rounded-lg p-2.5 text-slate-800 outline-none ${pincodeError ? "border-red-500 focus:border-red-500" : "border-slate-200 focus:border-blue-500"
                    }`}
                  value={pincode}
                  onChangeText={setPincode}
                />
                {pincodeError ? (
                  <Text className="text-red-500 text-xs mt-1 font-medium">{pincodeError}</Text>
                ) : null}
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Locality
                </Text>
                <TextInput
                  placeholder="e.g. Ghatlodiya"
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={locality}
                  onChangeText={setLocality}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  City
                </Text>
                <TextInput
                  placeholder="e.g. Ahmedabad"
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={city}
                  onChangeText={setCity}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  State
                </Text>
                <TextInput
                  placeholder="e.g. Gujarat"
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={state}
                  onChangeText={setState}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Person Name (Contact)
                </Text>
                <TextInput
                  placeholder="e.g. John Doe"
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={personName}
                  onChangeText={setPersonName}
                />
              </View>
            </ScrollView>

            {/* Actions */}
            <View className="flex-row space-x-3 mt-6">
              <TouchableOpacity
                onPress={() => { resetForm(); setIsModalOpen(false); }}
                className="flex-1 bg-slate-100 py-3 rounded-lg items-center"
              >
                <Text className="text-slate-700 font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveCustomer}
                className="flex-1 bg-blue-600 py-3 rounded-lg items-center"
              >
                <Text className="text-white font-semibold">
                  {editingCustomerId ? "Save Changes" : "Save Customer"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 5. MODAL: CREATE / EDIT QUOTE */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isQuoteModalOpen}
        onRequestClose={() => setIsQuoteModalOpen(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 p-4">
          <View className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-slate-800">
                {editingQuoteId ? "Edit Quote Details" : "Add New Quote"}
              </Text>
              <TouchableOpacity onPress={() => { resetQuoteForm(); setIsQuoteModalOpen(false); }}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Form Fields */}
            <ScrollView className="max-h-[60vh] pr-1" showsVerticalScrollIndicator={true}>
              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Select Customer *
                </Text>
                {customers.length === 0 ? (
                  <Text className="text-red-500 text-xs">Please create a customer first.</Text>
                ) : (
                  <View className="space-y-2">
                    <View className="flex-row items-center bg-slate-100 rounded-lg px-2.5 py-1.5 border border-slate-200">
                      <Ionicons name="search-outline" size={14} color="#64748b" />
                      <TextInput
                        placeholder="Search Customer..."
                        className="ml-2 text-xs text-slate-800 flex-1 outline-none"
                        value={customerSearchQuery}
                        onChangeText={setCustomerSearchQuery}
                      />
                    </View>
                    <View className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                      <ScrollView style={{ maxHeight: 120 }}>
                        {customers
                          .filter((c) =>
                            (c.company || "").toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                            (c.personName || "").toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                            (c.email || "").toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                            (c.gstin || "").toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                            (c.locality || "").toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                            (c.city || "").toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                            (c.state || "").toLowerCase().includes(customerSearchQuery.toLowerCase())
                          )
                          .map((c) => (
                            <TouchableOpacity
                              key={c.id}
                              onPress={() => setSelectedCustomerId(c.id)}
                              className={`p-2 border-b border-slate-100 flex-row justify-between items-center ${selectedCustomerId === c.id ? "bg-blue-50" : ""
                                }`}
                            >
                              <Text className="text-sm text-slate-800 font-medium">
                                {c.company || (c as any).name || "Unnamed Customer"}
                              </Text>
                              {selectedCustomerId === c.id && <Ionicons name="checkmark-circle" size={16} color="#2563eb" />}
                            </TouchableOpacity>
                          ))}
                      </ScrollView>
                    </View>
                  </View>
                )}
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Quote Number *
                </Text>
                <TextInput
                  placeholder="e.g. QT-1001"
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={docNumber}
                  onChangeText={setDocNumber}
                />
              </View>

              <View className="mb-4 flex-row gap-2">
                <View className="flex-1">
                  <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                    HSN Code
                  </Text>
                  <TextInput
                    placeholder="e.g. 8418"
                    className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500 w-full"
                    value={hsnCode}
                    onChangeText={setHsnCode}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                    Vehicle Number
                  </Text>
                  <TextInput
                    placeholder="e.g. GJ16AY1892"
                    className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500 w-full"
                    value={vehicleNo}
                    onChangeText={setVehicleNo}
                  />
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Quote Date
                </Text>
                {Platform.OS === "web" ? (
                  <input
                    type="date"
                    value={docDate}
                    onChange={(e) => setDocDate(e.target.value)}
                    style={{
                      backgroundColor: "#f8fafc",
                      borderWidth: 1,
                      borderColor: "#cbd5e1",
                      borderRadius: 8,
                      padding: 10,
                      color: "#1e293b",
                      fontSize: 14,
                      width: "100%",
                      outline: "none",
                    }}
                  />
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => setShowDocDatePicker(true)}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex-row justify-between items-center"
                    >
                      <Text className="text-slate-800 text-sm font-medium">{docDate || "Select Date"}</Text>
                      <Ionicons name="calendar-outline" size={18} color="#64748b" />
                    </TouchableOpacity>
                    {showDocDatePicker && (
                      <DateTimePicker
                        value={docDate ? new Date(docDate) : new Date()}
                        mode="date"
                        display="default"
                        onChange={(event, selectedDate) => {
                          setShowDocDatePicker(false);
                          if (selectedDate) {
                            setDocDate(selectedDate.toISOString().split("T")[0]);
                          }
                        }}
                      />
                    )}
                  </>
                )}
              </View>

              {/* Line Items */}
              <View className="mb-4">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-slate-600 text-xs font-semibold uppercase tracking-wider">Line Items *</Text>
                  <TouchableOpacity onPress={addLineItem} className="bg-blue-50 px-2 py-1 rounded flex-row items-center">
                    <Ionicons name="add" size={14} color="#2563eb" />
                    <Text className="text-blue-600 text-xs font-semibold ml-0.5">Add Item</Text>
                  </TouchableOpacity>
                </View>

                {docItems.map((item, idx) => (
                  <View key={idx} style={{ zIndex: docItems.length - idx }} className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2">
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className="text-slate-500 text-xs font-bold">Item #{idx + 1}</Text>
                      {docItems.length > 1 && (
                        <TouchableOpacity onPress={() => removeLineItem(idx)}>
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>

                    <TextInput
                      placeholder="Description (e.g. Consulting)"
                      className="bg-white border border-slate-200 rounded p-2 text-sm text-slate-800 mb-2 outline-none focus:border-blue-500"
                      value={item.description}
                      onChangeText={(v) => updateLineItem(idx, "description", v)}
                    />

                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Text className="text-slate-500 text-[10px] uppercase font-bold mb-0.5">Qty</Text>
                        <TextInput
                          placeholder="1"
                          keyboardType="numeric"
                          className="bg-white border border-slate-200 rounded p-1.5 text-xs text-slate-800 text-center outline-none focus:border-blue-500"
                          value={String(item.quantity)}
                          onChangeText={(v) => updateLineItem(idx, "quantity", v)}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-slate-500 text-[10px] uppercase font-bold mb-0.5">Unit</Text>
                        <TouchableOpacity
                          onPress={() => setOpenUnitDropdownIndex(openUnitDropdownIndex === idx ? null : idx)}
                          className="bg-white border border-slate-200 rounded p-1.5 flex-row justify-between items-center h-[28px] outline-none"
                        >
                          <Text className="text-[11px] text-slate-800 font-semibold">{item.unit || "Pcs"}</Text>
                          <Ionicons name="chevron-down" size={10} color="#64748b" />
                        </TouchableOpacity>
                      </View>
                      <View className="flex-[3]">
                        <Text className="text-slate-500 text-[10px] uppercase font-bold mb-0.5">Rate (₹)</Text>
                        <TextInput
                          placeholder="0"
                          keyboardType="numeric"
                          className="bg-white border border-slate-200 rounded p-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                          value={String(item.rate)}
                          onChangeText={(v) => updateLineItem(idx, "rate", v)}
                        />
                      </View>
                    </View>

                    {openUnitDropdownIndex === idx && (
                      <View className="mt-2 p-1.5 bg-slate-100 rounded-lg flex-row justify-around items-center">
                        <Text className="text-slate-500 text-[10px] uppercase font-bold mr-1">Unit:</Text>
                        {["Pcs", "Nos", "Kg", "Lot"].map((opt) => (
                          <TouchableOpacity
                            key={opt}
                            onPress={() => {
                              updateLineItem(idx, "unit", opt);
                              setOpenUnitDropdownIndex(null);
                            }}
                            className={`px-3 py-1 rounded-full border ${(item.unit || "Pcs") === opt
                              ? "bg-blue-600 border-blue-600"
                              : "bg-white border-slate-200"
                              }`}
                          >
                            <Text className={`text-[10px] font-semibold ${(item.unit || "Pcs") === opt ? "text-white" : "text-slate-600"}`}>
                              {opt}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>

              {/* GST Rate Selection */}
              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1.5 uppercase tracking-wider">
                  GST Rate Selection
                </Text>
                <View className="flex-row gap-2">
                  {[
                    { label: "CGST 9% + SGST 9%", value: "CGST 9% + SGST 9%", tax: "18" },
                    { label: "IGST 18%", value: "IGST 18%", tax: "18" },
                    { label: "No Tax", value: "No Tax", tax: "0" },
                  ].map((option) => {
                    const isSelected = gstRateSelection === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        onPress={() => {
                          setGstRateSelection(option.value);
                          setTaxPercent(option.tax);
                        }}
                        className={`flex-1 py-2 px-3 rounded-lg border items-center ${isSelected ? "bg-blue-600 border-blue-600" : "bg-white border-slate-200"
                          }`}
                      >
                        <Text className={`text-xs font-bold ${isSelected ? "text-white" : "text-slate-700"}`}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Dynamic Subtotals */}
              <View className="bg-slate-50 rounded-xl p-3 border border-slate-100 mb-4">
                <View className="flex-row justify-between py-1">
                  <Text className="text-slate-500 text-xs">Subtotal</Text>
                  <Text className="text-slate-800 text-xs font-semibold">
                    ₹{docItems.reduce((acc, item) => acc + (Number(item.rate) * Number(item.quantity)), 0).toFixed(2)}
                  </Text>
                </View>
                {gstRateSelection === "CGST 9% + SGST 9%" ? (
                  <>
                    <View className="flex-row justify-between py-1">
                      <Text className="text-slate-500 text-xs">CGST (9%)</Text>
                      <Text className="text-slate-800 text-xs font-semibold">
                        ₹{(docItems.reduce((acc, item) => acc + (Number(item.rate) * Number(item.quantity)), 0) * 0.09).toFixed(2)}
                      </Text>
                    </View>
                    <View className="flex-row justify-between py-1">
                      <Text className="text-slate-500 text-xs">SGST (9%)</Text>
                      <Text className="text-slate-800 text-xs font-semibold">
                        ₹{(docItems.reduce((acc, item) => acc + (Number(item.rate) * Number(item.quantity)), 0) * 0.09).toFixed(2)}
                      </Text>
                    </View>
                  </>
                ) : gstRateSelection === "IGST 18%" ? (
                  <View className="flex-row justify-between py-1">
                    <Text className="text-slate-500 text-xs">IGST (18%)</Text>
                    <Text className="text-slate-800 text-xs font-semibold">
                      ₹{(docItems.reduce((acc, item) => acc + (Number(item.rate) * Number(item.quantity)), 0) * 0.18).toFixed(2)}
                    </Text>
                  </View>
                ) : null}
                <View className="border-t border-slate-200 my-1.5" />
                <View className="flex-row justify-between py-1">
                  <Text className="text-slate-800 text-sm font-bold">Total Amount</Text>
                  <Text className="text-blue-600 text-sm font-bold">
                    ₹{(
                      docItems.reduce((acc, item) => acc + (Number(item.rate) * Number(item.quantity)), 0) * (1 + ((Number(taxPercent) || 0) / 100))
                    ).toFixed(2)}
                  </Text>
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Notes / Terms
                </Text>
                <TextInput
                  placeholder="e.g. Valid for 30 days"
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={docNotes}
                  onChangeText={setDocNotes}
                />
              </View>
            </ScrollView>

            {/* Actions */}
            <View className="flex-row space-x-3 mt-6">
              <TouchableOpacity
                onPress={() => { resetQuoteForm(); setIsQuoteModalOpen(false); }}
                className="flex-1 bg-slate-100 py-3 rounded-lg items-center"
              >
                <Text className="text-slate-700 font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveQuote}
                className="flex-1 bg-blue-600 py-3 rounded-lg items-center"
              >
                <Text className="text-white font-semibold">
                  {editingQuoteId ? "Save Changes" : "Save Quote"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 6. MODAL: CREATE / EDIT INVOICE */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isInvoiceModalOpen}
        onRequestClose={() => setIsInvoiceModalOpen(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 p-4">
          <View className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-slate-800">
                {editingInvoiceId ? "Edit Invoice Details" : "Add New Invoice"}
              </Text>
              <TouchableOpacity onPress={() => { resetInvoiceForm(); setIsInvoiceModalOpen(false); }}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Form Fields */}
            <ScrollView className="max-h-[60vh] pr-1" showsVerticalScrollIndicator={true}>
              {/* Party 1 Type and Customer Selection */}
              <View className="mb-4 border border-slate-100 bg-slate-50/50 p-3 rounded-xl" style={{ zIndex: showType1Dropdown ? 50 : 10 }}>
                <Text className="text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">
                  Party 1 Selection
                </Text>
                <View className="flex-row space-x-2 mb-2" style={{ zIndex: 30 }}>
                  <View className="flex-1 relative" style={{ zIndex: 40 }}>
                    <Text className="text-slate-500 text-[10px] uppercase font-bold mb-1">Type *</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setShowType1Dropdown(!showType1Dropdown);
                        setShowType2Dropdown(false);
                      }}
                      className="bg-white border border-slate-200 rounded-lg p-2 flex-row justify-between items-center h-10"
                    >
                      <Text className="text-slate-800 text-xs font-medium">{clientType1}</Text>
                      <Ionicons name="chevron-down" size={14} color="#64748b" />
                    </TouchableOpacity>
                    {showType1Dropdown && (
                      <View className="absolute top-11 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg z-[100] overflow-hidden">
                        {["To", "Dispatch From", "Bill To", "Ship To", "Ship To/Bill To"].map((t) => (
                          <TouchableOpacity
                            key={t}
                            onPress={() => {
                              setClientType1(t);
                              setShowType1Dropdown(false);
                            }}
                            className="p-2 border-b border-slate-100 hover:bg-slate-50"
                          >
                            <Text className="text-xs text-slate-700">{t}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  <View className="flex-[2]" style={{ zIndex: 10 }}>
                    <Text className="text-slate-500 text-[10px] uppercase font-bold mb-1">Search Customer *</Text>
                    <View className="flex-row items-center bg-white rounded-lg px-2 border border-slate-200 h-10">
                      <Ionicons name="search-outline" size={12} color="#64748b" />
                      <TextInput
                        placeholder="Search Customer..."
                        className="ml-1 text-xs text-slate-800 flex-1 outline-none"
                        value={customerSearchQuery1}
                        onChangeText={setCustomerSearchQuery1}
                      />
                    </View>
                  </View>
                </View>

                {customers.length === 0 ? (
                  <Text className="text-red-500 text-[11px]">Please create a customer first.</Text>
                ) : (
                  <View className="border border-slate-200 rounded-lg overflow-hidden bg-white mt-1" style={{ zIndex: 5 }}>
                    <ScrollView style={{ maxHeight: 90 }}>
                      {customers
                        .filter((c) =>
                          (c.company || "").toLowerCase().includes(customerSearchQuery1.toLowerCase()) ||
                          (c.personName || "").toLowerCase().includes(customerSearchQuery1.toLowerCase()) ||
                          (c.email || "").toLowerCase().includes(customerSearchQuery1.toLowerCase()) ||
                          (c.gstin || "").toLowerCase().includes(customerSearchQuery1.toLowerCase()) ||
                          (c.locality || "").toLowerCase().includes(customerSearchQuery1.toLowerCase()) ||
                          (c.city || "").toLowerCase().includes(customerSearchQuery1.toLowerCase()) ||
                          (c.state || "").toLowerCase().includes(customerSearchQuery1.toLowerCase())
                        )
                        .map((c) => (
                          <TouchableOpacity
                            key={c.id}
                            onPress={() => setSelectedCustomerId1(c.id)}
                            className={`p-2 border-b border-slate-100 flex-row justify-between items-center ${selectedCustomerId1 === c.id ? "bg-blue-50" : ""
                              }`}
                          >
                            <Text className="text-xs text-slate-800 font-medium">
                              {c.company || (c as any).name || "Unnamed Customer"}
                            </Text>
                            {selectedCustomerId1 === c.id && <Ionicons name="checkmark-circle" size={14} color="#2563eb" />}
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Party 2 Type and Customer Selection */}
              <View className="mb-4 border border-slate-100 bg-slate-50/50 p-3 rounded-xl" style={{ zIndex: showType2Dropdown ? 50 : 9 }}>
                <Text className="text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">
                  Party 2 Selection (Optional)
                </Text>
                <View className="flex-row space-x-2 mb-2" style={{ zIndex: 30 }}>
                  <View className="flex-1 relative" style={{ zIndex: 40 }}>
                    <Text className="text-slate-500 text-[10px] uppercase font-bold mb-1">Type</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setShowType2Dropdown(!showType2Dropdown);
                        setShowType1Dropdown(false);
                      }}
                      className="bg-white border border-slate-200 rounded-lg p-2 flex-row justify-between items-center h-10"
                    >
                      <Text className="text-slate-800 text-xs font-medium">{clientType2}</Text>
                      <Ionicons name="chevron-down" size={14} color="#64748b" />
                    </TouchableOpacity>
                    {showType2Dropdown && (
                      <View className="absolute top-11 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg z-[100] overflow-hidden">
                        {["To", "Dispatch From", "Bill To", "Ship To", "Ship To/Bill To"].map((t) => (
                          <TouchableOpacity
                            key={t}
                            onPress={() => {
                              setClientType2(t);
                              setShowType2Dropdown(false);
                            }}
                            className="p-2 border-b border-slate-100 hover:bg-slate-50"
                          >
                            <Text className="text-xs text-slate-700">{t}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  <View className="flex-[2]" style={{ zIndex: 10 }}>
                    <Text className="text-slate-500 text-[10px] uppercase font-bold mb-1">Search Customer</Text>
                    <View className="flex-row items-center bg-white rounded-lg px-2 border border-slate-200 h-10">
                      <Ionicons name="search-outline" size={12} color="#64748b" />
                      <TextInput
                        placeholder="Search Customer..."
                        className="ml-1 text-xs text-slate-800 flex-1 outline-none"
                        value={customerSearchQuery2}
                        onChangeText={setCustomerSearchQuery2}
                      />
                    </View>
                  </View>
                </View>

                {customers.length > 0 && (
                  <View className="border border-slate-200 rounded-lg overflow-hidden bg-white mt-1">
                    <ScrollView style={{ maxHeight: 90 }}>
                      <TouchableOpacity
                        onPress={() => setSelectedCustomerId2("")}
                        className={`p-2 border-b border-slate-100 flex-row justify-between items-center ${selectedCustomerId2 === "" ? "bg-slate-50" : ""}`}
                      >
                        <Text className="text-xs text-slate-500 italic">None (Clear Selection)</Text>
                        {selectedCustomerId2 === "" && <Ionicons name="checkmark-circle" size={14} color="#64748b" />}
                      </TouchableOpacity>
                      {customers
                        .filter((c) =>
                          (c.company || "").toLowerCase().includes(customerSearchQuery2.toLowerCase()) ||
                          (c.personName || "").toLowerCase().includes(customerSearchQuery2.toLowerCase()) ||
                          (c.email || "").toLowerCase().includes(customerSearchQuery2.toLowerCase()) ||
                          (c.gstin || "").toLowerCase().includes(customerSearchQuery2.toLowerCase()) ||
                          (c.locality || "").toLowerCase().includes(customerSearchQuery2.toLowerCase()) ||
                          (c.city || "").toLowerCase().includes(customerSearchQuery2.toLowerCase()) ||
                          (c.state || "").toLowerCase().includes(customerSearchQuery2.toLowerCase())
                        )
                        .map((c) => (
                          <TouchableOpacity
                            key={c.id}
                            onPress={() => setSelectedCustomerId2(c.id)}
                            className={`p-2 border-b border-slate-100 flex-row justify-between items-center ${selectedCustomerId2 === c.id ? "bg-blue-50" : ""
                              }`}
                          >
                            <Text className="text-xs text-slate-800 font-medium">
                              {c.company || (c as any).name || "Unnamed Customer"}
                            </Text>
                            {selectedCustomerId2 === c.id && <Ionicons name="checkmark-circle" size={14} color="#2563eb" />}
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Invoice Number *
                </Text>
                <TextInput
                  placeholder="e.g. INV-1001"
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={docNumber}
                  onChangeText={setDocNumber}
                />
              </View>

              <View className="mb-4 flex-row gap-2">
                <View className="flex-1">
                  <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                    HSN Code
                  </Text>
                  <TextInput
                    placeholder="e.g. 8418"
                    className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500 w-full"
                    value={hsnCode}
                    onChangeText={setHsnCode}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                    Vehicle Number
                  </Text>
                  <TextInput
                    placeholder="e.g. GJ16AY1892"
                    className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500 w-full"
                    value={vehicleNo}
                    onChangeText={setVehicleNo}
                  />
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Invoice Date
                </Text>
                {Platform.OS === "web" ? (
                  <input
                    type="date"
                    value={docDate}
                    onChange={(e) => setDocDate(e.target.value)}
                    style={{
                      backgroundColor: "#f8fafc",
                      borderWidth: 1,
                      borderColor: "#cbd5e1",
                      borderRadius: 8,
                      padding: 10,
                      color: "#1e293b",
                      fontSize: 14,
                      width: "100%",
                      outline: "none",
                    }}
                  />
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={() => setShowDocDatePicker(true)}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex-row justify-between items-center"
                    >
                      <Text className="text-slate-800 text-sm font-medium">{docDate || "Select Date"}</Text>
                      <Ionicons name="calendar-outline" size={16} color="#64748b" />
                    </TouchableOpacity>
                    {showDocDatePicker && (
                      <DateTimePicker
                        value={docDate ? new Date(docDate) : new Date()}
                        mode="date"
                        display="default"
                        onChange={(event, selectedDate) => {
                          setShowDocDatePicker(false);
                          if (selectedDate) {
                            setDocDate(selectedDate.toISOString().split("T")[0]);
                          }
                        }}
                      />
                    )}
                  </>
                )}
              </View>

              {/* Line Items */}
              <View className="mb-4">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-slate-600 text-xs font-semibold uppercase tracking-wider">Line Items *</Text>
                  <TouchableOpacity onPress={addLineItem} className="bg-blue-50 px-2 py-1 rounded flex-row items-center">
                    <Ionicons name="add" size={14} color="#2563eb" />
                    <Text className="text-blue-600 text-xs font-semibold ml-0.5">Add Item</Text>
                  </TouchableOpacity>
                </View>

                {docItems.map((item, idx) => (
                  <View key={idx} style={{ zIndex: docItems.length - idx }} className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2">
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className="text-slate-500 text-xs font-bold">Item #{idx + 1}</Text>
                      {docItems.length > 1 && (
                        <TouchableOpacity onPress={() => removeLineItem(idx)}>
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>

                    <TextInput
                      placeholder="Description (e.g. Consulting)"
                      className="bg-white border border-slate-200 rounded p-2 text-sm text-slate-800 mb-2 outline-none focus:border-blue-500"
                      value={item.description}
                      onChangeText={(v) => updateLineItem(idx, "description", v)}
                    />

                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Text className="text-slate-500 text-[10px] uppercase font-bold mb-0.5">Qty</Text>
                        <TextInput
                          placeholder="1"
                          keyboardType="numeric"
                          className="bg-white border border-slate-200 rounded p-1.5 text-xs text-slate-800 text-center outline-none focus:border-blue-500"
                          value={String(item.quantity)}
                          onChangeText={(v) => updateLineItem(idx, "quantity", v)}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-slate-500 text-[10px] uppercase font-bold mb-0.5">Unit</Text>
                        <TouchableOpacity
                          onPress={() => setOpenUnitDropdownIndex(openUnitDropdownIndex === idx ? null : idx)}
                          className="bg-white border border-slate-200 rounded p-1.5 flex-row justify-between items-center h-[28px] outline-none"
                        >
                          <Text className="text-[11px] text-slate-800 font-semibold">{item.unit || "Pcs"}</Text>
                          <Ionicons name="chevron-down" size={10} color="#64748b" />
                        </TouchableOpacity>
                      </View>
                      <View className="flex-[3]">
                        <Text className="text-slate-500 text-[10px] uppercase font-bold mb-0.5">Rate (₹)</Text>
                        <TextInput
                          placeholder="0"
                          keyboardType="numeric"
                          className="bg-white border border-slate-200 rounded p-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                          value={String(item.rate)}
                          onChangeText={(v) => updateLineItem(idx, "rate", v)}
                        />
                      </View>
                    </View>

                    {openUnitDropdownIndex === idx && (
                      <View className="mt-2 p-1.5 bg-slate-100 rounded-lg flex-row justify-around items-center">
                        <Text className="text-slate-500 text-[10px] uppercase font-bold mr-1">Unit:</Text>
                        {["Pcs", "Nos", "Kg", "Lot"].map((opt) => (
                          <TouchableOpacity
                            key={opt}
                            onPress={() => {
                              updateLineItem(idx, "unit", opt);
                              setOpenUnitDropdownIndex(null);
                            }}
                            className={`px-3 py-1 rounded-full border ${(item.unit || "Pcs") === opt
                              ? "bg-blue-600 border-blue-600"
                              : "bg-white border-slate-200"
                              }`}
                          >
                            <Text className={`text-[10px] font-semibold ${(item.unit || "Pcs") === opt ? "text-white" : "text-slate-600"}`}>
                              {opt}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>

              {/* GST Rate Selection */}
              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1.5 uppercase tracking-wider">
                  GST Rate Selection
                </Text>
                <View className="flex-row gap-2">
                  {[
                    { label: "CGST 9% + SGST 9%", value: "CGST 9% + SGST 9%", tax: "18" },
                    { label: "IGST 18%", value: "IGST 18%", tax: "18" },
                    { label: "No Tax", value: "No Tax", tax: "0" },
                  ].map((option) => {
                    const isSelected = gstRateSelection === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        onPress={() => {
                          setGstRateSelection(option.value);
                          setTaxPercent(option.tax);
                        }}
                        className={`flex-1 py-2 px-3 rounded-lg border items-center ${isSelected ? "bg-blue-600 border-blue-600" : "bg-white border-slate-200"
                          }`}
                      >
                        <Text className={`text-xs font-bold ${isSelected ? "text-white" : "text-slate-700"}`}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Round Off Check Button */}
              <TouchableOpacity
                onPress={() => setIsRoundOff(!isRoundOff)}
                className="flex-row items-center mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200"
              >
                <View className={`w-5 h-5 rounded border mr-2 items-center justify-center ${isRoundOff ? "bg-blue-600 border-blue-600" : "bg-white border-slate-300"}`}>
                  {isRoundOff && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                </View>
                <Text className="text-sm font-semibold text-slate-700">Apply Round Off</Text>
              </TouchableOpacity>

              {/* Dynamic Subtotals */}
              <View className="bg-slate-50 rounded-xl p-3 border border-slate-100 mb-4">
                <View className="flex-row justify-between py-1">
                  <Text className="text-slate-500 text-xs">Subtotal</Text>
                  <Text className="text-slate-800 text-xs font-semibold">
                    ₹{docItems.reduce((acc, item) => acc + (Number(item.rate) * Number(item.quantity)), 0).toFixed(2)}
                  </Text>
                </View>
                {gstRateSelection === "CGST 9% + SGST 9%" ? (
                  <>
                    <View className="flex-row justify-between py-1">
                      <Text className="text-slate-500 text-xs">CGST (9%)</Text>
                      <Text className="text-slate-800 text-xs font-semibold">
                        ₹{(docItems.reduce((acc, item) => acc + (Number(item.rate) * Number(item.quantity)), 0) * 0.09).toFixed(2)}
                      </Text>
                    </View>
                    <View className="flex-row justify-between py-1">
                      <Text className="text-slate-500 text-xs">SGST (9%)</Text>
                      <Text className="text-slate-800 text-xs font-semibold">
                        ₹{(docItems.reduce((acc, item) => acc + (Number(item.rate) * Number(item.quantity)), 0) * 0.09).toFixed(2)}
                      </Text>
                    </View>
                  </>
                ) : gstRateSelection === "IGST 18%" ? (
                  <View className="flex-row justify-between py-1">
                    <Text className="text-slate-500 text-xs">IGST (18%)</Text>
                    <Text className="text-slate-800 text-xs font-semibold">
                      ₹{(docItems.reduce((acc, item) => acc + (Number(item.rate) * Number(item.quantity)), 0) * 0.18).toFixed(2)}
                    </Text>
                  </View>
                ) : null}
                {isRoundOff && (() => {
                  const rawTotal = docItems.reduce((acc, item) => acc + (Number(item.rate) * Number(item.quantity)), 0) * (1 + ((Number(taxPercent) || 0) / 100));
                  const roundedTotal = Math.round(rawTotal);
                  const diff = roundedTotal - rawTotal;
                  const formattedDiff = diff >= 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
                  return (
                    <View className="flex-row justify-between py-1">
                      <Text className="text-slate-500 text-xs">Round Off Diff</Text>
                      <Text className="text-slate-800 text-xs font-semibold">
                        ₹{formattedDiff}
                      </Text>
                    </View>
                  );
                })()}
                <View className="border-t border-slate-200 my-1.5" />
                <View className="flex-row justify-between py-1">
                  <Text className="text-slate-800 text-sm font-bold">Total Amount</Text>
                  <Text className="text-blue-600 text-sm font-bold">
                    ₹{(
                      isRoundOff
                        ? Math.round(docItems.reduce((acc, item) => acc + (Number(item.rate) * Number(item.quantity)), 0) * (1 + ((Number(taxPercent) || 0) / 100)))
                        : (docItems.reduce((acc, item) => acc + (Number(item.rate) * Number(item.quantity)), 0) * (1 + ((Number(taxPercent) || 0) / 100)))
                    ).toFixed(2)}
                  </Text>
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Notes / Terms
                </Text>
                <TextInput
                  placeholder="e.g. Thank you for your business!"
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={docNotes}
                  onChangeText={setDocNotes}
                />
              </View>
            </ScrollView>

            {/* Actions */}
            <View className="flex-row space-x-3 mt-6">
              <TouchableOpacity
                onPress={() => { resetInvoiceForm(); setIsInvoiceModalOpen(false); }}
                className="flex-1 bg-slate-100 py-3 rounded-lg items-center"
              >
                <Text className="text-slate-700 font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveInvoice}
                className="flex-1 bg-blue-600 py-3 rounded-lg items-center"
              >
                <Text className="text-white font-semibold">
                  {editingInvoiceId ? "Save Changes" : "Save Invoice"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 7. MODAL: EDIT MY DETAILS */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isMyDetailsModalOpen}
        onRequestClose={() => setIsMyDetailsModalOpen(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50 p-4">
          <View className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-slate-800">Edit Company Details</Text>
              <TouchableOpacity onPress={() => setIsMyDetailsModalOpen(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView className="max-h-[60vh] space-y-4 pr-1" showsVerticalScrollIndicator={true}>
              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Company Name *
                </Text>
                <TextInput
                  placeholder=""
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={myCompanyName}
                  onChangeText={setMyCompanyName}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  GSTIN No.
                </Text>
                <TextInput
                  placeholder=""
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={myGstin}
                  onChangeText={setMyGstin}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Company Email
                </Text>
                <TextInput
                  placeholder=""
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={myEmail}
                  onChangeText={setMyEmail}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Company Mobile
                </Text>
                <TextInput
                  placeholder=""
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={myMobile}
                  onChangeText={setMyMobile}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Company Address
                </Text>
                <TextInput
                  placeholder=""
                  multiline={true}
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={myAddress}
                  onChangeText={setMyAddress}
                  style={{ minHeight: 60 }}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Bank Name
                </Text>
                <TextInput
                  placeholder=""
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={myBankName}
                  onChangeText={setMyBankName}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Bank Account Number
                </Text>
                <TextInput
                  placeholder=""
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={myBankAccountNo}
                  onChangeText={setMyBankAccountNo}
                />
              </View>

              <View className="mb-4">
                <Text className="text-slate-600 text-xs font-semibold mb-1 uppercase tracking-wider">
                  Bank IFSC Code
                </Text>
                <TextInput
                  placeholder=""
                  className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 outline-none focus:border-blue-500"
                  value={myBankIfsc}
                  onChangeText={setMyBankIfsc}
                />
              </View>
            </ScrollView>

            <View className="flex-row space-x-3 mt-6">
              <TouchableOpacity
                onPress={() => setIsMyDetailsModalOpen(false)}
                className="flex-1 bg-slate-100 py-3 rounded-lg items-center"
              >
                <Text className="text-slate-700 font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveMyDetails}
                className="flex-1 bg-blue-600 py-3 rounded-lg items-center"
              >
                <Text className="text-white font-semibold">Save Details</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
