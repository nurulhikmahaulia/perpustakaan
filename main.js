// ==================== IMPOR FIREBASE SDK ====================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
    getFirestore, collection, doc, getDocs, getDoc, addDoc, deleteDoc, updateDoc, query, orderBy, where 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Konfigurasi Firebase (proyek Insan Cemerlang)
const firebaseConfig = {
    apiKey: "AIzaSyDdr0fxnYpfeG2b6GlTQ_-4TqpmGk2uvOk",
    authDomain: "insan-cemerlang-80713.firebaseapp.com",
    projectId: "insan-cemerlang-80713",
    storageBucket: "insan-cemerlang-80713.appspot.com",
    messagingSenderId: "1016858047753",
    appId: "1:1016858047753:web:0534dda2085c2adab68fd8"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// Referensi koleksi Firestore
const usersCol = collection(db, "users");
const booksCol = collection(db, "books");
const loansCol = collection(db, "loans");
const returnsCol = collection(db, "returns");
const finesCol = collection(db, "fines");
const DENDA_PER_HARI = 1000;

let currentUser = null; // Menyimpan data user yang sedang login

// ==================== FUNGSI UTILITY ====================
function toast(icon, title, text = "") {
    Swal.fire({ icon, title, text, timer: 1800, showConfirmButton: false, position: 'top-end' });
}

function isValidEmail(email) {
    return /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(email);
}

// Menghitung denda berdasarkan tanggal jatuh tempo dan tanggal kembali (default hari ini)
function hitungDenda(dueDateStr, returnDateStr = null) {
    const due = new Date(dueDateStr);
    const ret = returnDateStr ? new Date(returnDateStr) : new Date();
    if (isNaN(due) || isNaN(ret)) return { daysLate: 0, denda: 0 };
    due.setHours(0,0,0,0);
    ret.setHours(0,0,0,0);
    const diffTime = ret - due;
    const daysLate = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
    return { daysLate, denda: daysLate * DENDA_PER_HARI };
}

// Mencatat denda ke koleksi fines
async function catatDenda(loanId, userId, amount, reason, tanggal) {
    if (amount <= 0) return;
    await addDoc(finesCol, { loanId, userId, amount, reason, tanggal: tanggal || new Date().toISOString().split('T')[0], createdAt: new Date().toISOString() });
}

// ==================== SEED DATA AWAL (jika kosong) ====================
async function seedInitialData() {
    const userSnap = await getDocs(usersCol);
    if (userSnap.empty) {
        // Menambahkan admin dan dua contoh siswa
        await addDoc(usersCol, { name: "Administrator", email: "admin@perpustakaan.com", password: "admin123", role: "admin", kelas: "-", tanggalDaftar: new Date().toISOString().split('T')[0] });
        await addDoc(usersCol, { name: "Andi Saputra", email: "andi@student.com", password: "siswa123", role: "user", kelas: "XI RPL 1", tanggalDaftar: new Date().toISOString().split('T')[0] });
        await addDoc(usersCol, { name: "Budi Santoso", email: "budi@student.com", password: "siswa123", role: "user", kelas: "XII RPL 2", tanggalDaftar: new Date().toISOString().split('T')[0] });
    }
    const booksSnap = await getDocs(booksCol);
    if (booksSnap.empty) {
        const books = [
            { judul: "Pemrograman Web dengan PHP & MySQL", penerbit: "Elex Media", kategori: "Teknologi", stokTotal: 5, tersedia: 5 },
            { judul: "Basis Data: Teori dan Implementasi", penerbit: "Informatika", kategori: "Database", stokTotal: 4, tersedia: 4 },
            { judul: "Matematika Diskrit & Aplikasinya", penerbit: "Gramedia", kategori: "Matematika", stokTotal: 3, tersedia: 3 },
            { judul: "English for Academic Purpose", penerbit: "Cambridge", kategori: "Bahasa", stokTotal: 6, tersedia: 6 }
        ];
        for (let book of books) await addDoc(booksCol, book);
    }
    const loansSnap = await getDocs(loansCol);
    if (loansSnap.empty) {
        const users = await getDocs(usersCol);
        const books = await getDocs(booksCol);
        const userAndi = users.docs.find(d => d.data().email === "andi@student.com");
        const book1 = books.docs[0];
        if (userAndi && book1) {
            const loanDate = new Date();
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);
            await addDoc(loansCol, { userId: userAndi.id, bookId: book1.id, tanggalPinjam: loanDate.toISOString().split('T')[0], tanggalJatuhTempo: dueDate.toISOString().split('T')[0], status: "active" });
            await updateDoc(doc(db, "books", book1.id), { tersedia: book1.data().tersedia - 1 });
        }
    }
}

// ==================== LOGIN & SESI ====================
async function login(email, password) {
    try {
        const q = query(usersCol, where("email", "==", email), where("password", "==", password));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            currentUser = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            sessionStorage.setItem("pustaka_session", JSON.stringify(currentUser));
            toast("success", `Selamat datang, ${currentUser.name}`);
            showDashboard();
            return true;
        } else { toast("error", "Login gagal", "Email atau password salah"); return false; }
    } catch (err) { toast("error", "Error koneksi", err.message); return false; }
}

// Registrasi anggota baru (role user)
async function registerMember(name, email, kelas, password) {
    if (!name || !email || !kelas || !password) { toast("error", "Semua field harus diisi"); return false; }
    if (!isValidEmail(email)) { toast("error", "Email tidak valid!"); return false; }
    const existing = await getDocs(query(usersCol, where("email", "==", email)));
    if (!existing.empty) { toast("error", "Email sudah terdaftar"); return false; }
    await addDoc(usersCol, { name, email, password, role: "user", kelas, tanggalDaftar: new Date().toISOString().split('T')[0] });
    toast("success", "Pendaftaran berhasil! Silakan login.");
    return true;
}

// Cek session di sessionStorage
function checkSession() {
    const saved = sessionStorage.getItem("pustaka_session");
    if (saved) { currentUser = JSON.parse(saved); showDashboard(); return true; }
    return false;
}

// Logout
function logout() {
    sessionStorage.removeItem("pustaka_session");
    currentUser = null;
    document.getElementById("loginPage").style.display = "flex";
    document.getElementById("dashboardPage").style.display = "none";
    toast("info", "Anda telah keluar");
}

// ==================== FUNGSI PENGEMBALIAN & DENDA ====================
async function safeReturnBook(loanId, bookId) {
    try {
        const loanRef = doc(db, "loans", loanId);
        const loanSnap = await getDoc(loanRef);
        if (!loanSnap.exists() || loanSnap.data().status !== "active") { toast("error", "Peminjaman tidak valid"); return false; }
        const loan = loanSnap.data();
        const dueDate = loan.tanggalJatuhTempo;
        const todayStr = new Date().toISOString().split('T')[0];
        const { daysLate, denda } = hitungDenda(dueDate, todayStr);
        if (denda > 0) {
            const confirmDenda = await Swal.fire({ title: "⚠️ Keterlambatan Pengembalian", html: `<p>Terlambat <strong>${daysLate} hari</strong>.</p><p>Denda: <strong class="text-danger">Rp ${denda.toLocaleString()}</strong></p>`, icon: "warning", confirmButtonText: "Konfirmasi & Kembalikan", showCancelButton: true });
            if (!confirmDenda.isConfirmed) return false;
            await catatDenda(loanId, loan.userId, denda, `Denda keterlambatan (${daysLate} hari)`, todayStr);
            toast("info", `Denda Rp ${denda.toLocaleString()} dicatat.`);
        }
        await updateDoc(loanRef, { status: "returned" });
        const bookRef = doc(db, "books", bookId);
        const bookSnap = await getDoc(bookRef);
        if (bookSnap.exists()) await updateDoc(bookRef, { tersedia: (bookSnap.data().tersedia || 0) + 1 });
        await addDoc(returnsCol, { loanId, tanggalKembali: todayStr, denda });
        toast("success", "Buku berhasil dikembalikan" + (denda > 0 ? ` (Denda Rp ${denda.toLocaleString()})` : ""));
        return true;
    } catch (err) { toast("error", "Gagal mengembalikan buku", err.message); return false; }
}

// Hapus transaksi peminjaman (hanya yang sudah dikembalikan)
async function deleteLoanTransaction(loanId) {
    try {
        const confirm = await Swal.fire({ title: "Hapus Transaksi?", text: "Transaksi yang sudah dikembalikan akan dihapus permanen.", icon: "warning", showCancelButton: true, confirmButtonColor: "#d33", confirmButtonText: "Ya, hapus!" });
        if (!confirm.isConfirmed) return false;
        const loanRef = doc(db, "loans", loanId);
        const loanSnap = await getDoc(loanRef);
        if (!loanSnap.exists() || loanSnap.data().status !== "returned") { toast("error", "Hanya transaksi yang sudah dikembalikan yang dapat dihapus"); return false; }
        const returnsQuery = query(returnsCol, where("loanId", "==", loanId));
        const returnsSnap = await getDocs(returnsQuery);
        for (const retDoc of returnsSnap.docs) await deleteDoc(doc(db, "returns", retDoc.id));
        await deleteDoc(loanRef);
        toast("success", "Transaksi dihapus");
        return true;
    } catch (err) { toast("error", "Gagal menghapus", err.message); return false; }
}

// PERPANJANG JATUH TEMPO (hanya untuk ADMIN)
async function extendLoanFlexible(loanId, currentDueDate) {
    if (!currentUser || currentUser.role !== 'admin') {
        toast("error", "Akses ditolak! Hanya admin yang dapat memperpanjang jatuh tempo.");
        return false;
    }
    const loanRef = doc(db, "loans", loanId);
    const loanSnap = await getDoc(loanRef);
    if (!loanSnap.exists() || loanSnap.data().status !== "active") { toast("error", "Peminjaman tidak aktif"); return false; }
    const { value: newDateStr } = await Swal.fire({
        title: "Perpanjang Jatuh Tempo (Admin)",
        html: `<p>Jatuh tempo saat ini: <strong>${currentDueDate}</strong></p><p>Pilih tanggal baru:</p><input type="date" id="newDueDateInput" class="swal2-input" value="${new Date().toISOString().split('T')[0]}" min="${new Date().toISOString().split('T')[0]}">`,
        preConfirm: () => { const val = document.getElementById("newDueDateInput")?.value; if (!val) return Swal.showValidationMessage("Tanggal harus diisi"); const selectedDate = new Date(val); const today = new Date(); today.setHours(0,0,0,0); if (selectedDate < today) return Swal.showValidationMessage("Tanggal tidak boleh kurang dari hari ini"); return val; }
    });
    if (!newDateStr) return false;
    await updateDoc(loanRef, { tanggalJatuhTempo: newDateStr });
    toast("success", `Jatuh tempo diubah menjadi ${newDateStr}`);
    return true;
}

// ==================== ADMIN: SEMUA TRANSAKSI PEMINJAMAN ====================
async function loadAllTransactions() {
    const container = document.getElementById("dynamicContent");
    container.innerHTML = `<h4><i class="fas fa-chart-line text-primary"></i> Seluruh Transaksi Peminjaman</h4><div class="card-table mt-3" id="allLoansTable">Memuat...</div>`;
    await renderAllLoansTable();
    // Event delegation untuk tombol aksi di tabel
    document.getElementById("allLoansTable")?.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action, loanId = btn.dataset.loan, bookId = btn.dataset.book, due = btn.dataset.due;
        if (action === "return") { await safeReturnBook(loanId, bookId); await renderAllLoansTable(); }
        else if (action === "extend") { await extendLoanFlexible(loanId, due); await renderAllLoansTable(); }
        else if (action === "delete") { await deleteLoanTransaction(loanId); await renderAllLoansTable(); }
    });
}

async function renderAllLoansTable() {
    const loansSnap = await getDocs(loansCol);
    let loans = loansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    loans.sort((a,b) => new Date(b.tanggalPinjam) - new Date(a.tanggalPinjam));
    
    if (loans.length === 0) {
        document.getElementById("allLoansTable").innerHTML = '<div class="alert alert-info">Tidak ada transaksi peminjaman.</div>';
        return;
    }
    
    const [usersSnap, booksSnap] = await Promise.all([getDocs(usersCol), getDocs(booksCol)]);
    const userMap = new Map(usersSnap.docs.map(d => [d.id, d.data().name || "Tidak dikenal"]));
    const bookMap = new Map(booksSnap.docs.map(d => [d.id, d.data().judul || "Tidak dikenal"]));
    
    const todayStr = new Date().toISOString().split('T')[0];
    let html = `<div class="table-responsive"><table class="table table-bordered align-middle"><thead class="table-light"><tr><th>Peminjam</th><th>Buku</th><th>Tgl Pinjam</th><th>Jatuh Tempo</th><th>Status</th><th>Denda (Rp)</th><th>Aksi</th></tr></thead><tbody>`;
    
    for (const loan of loans) {
        const userName = userMap.get(loan.userId) || "-";
        const bookTitle = bookMap.get(loan.bookId) || "-";
        const isActive = loan.status === 'active';
        const isReturned = loan.status === 'returned';
        const { denda } = hitungDenda(loan.tanggalJatuhTempo, todayStr);
        const dendaTampil = (isActive && denda > 0) ? denda : 0;
        html += `<tr>
            <td>${escapeHtml(userName)}</td>
            <td>${escapeHtml(bookTitle)}</td>
            <td>${loan.tanggalPinjam}</td>
            <td class="${dendaTampil > 0 ? 'text-danger fw-bold' : ''}">${loan.tanggalJatuhTempo}</td>
            <td><span class="badge ${isActive ? 'bg-warning' : 'bg-success'}">${isActive ? 'Dipinjam' : 'Dikembalikan'}</span></td>
            <td>${dendaTampil > 0 ? `Rp ${dendaTampil.toLocaleString()}` : '-'}</td>
            <td>${isActive ? `<button class="btn btn-sm btn-primary me-1" data-action="return" data-loan="${loan.id}" data-book="${loan.bookId}"><i class="fas fa-undo-alt"></i> Kembali</button><button class="btn btn-sm btn-info text-white" data-action="extend" data-loan="${loan.id}" data-due="${loan.tanggalJatuhTempo}"><i class="fas fa-calendar-plus"></i> Perpanjang</button>` : ''}${isReturned ? `<button class="btn btn-sm btn-danger" data-action="delete" data-loan="${loan.id}"><i class="fas fa-trash-alt"></i> Hapus</button>` : ''}</td>
        </tr>`;
    }
    html += `</tbody></table></div>`;
    document.getElementById("allLoansTable").innerHTML = html;
}

// ==================== USER: RIWAYAT PEMINJAMAN SAYA ====================
async function loadMyLoans() {
    const container = document.getElementById("dynamicContent");
    container.innerHTML = `<h4><i class="fas fa-clock text-primary"></i> Riwayat & Peminjaman Aktif Saya</h4><div class="card-table mt-3" id="myLoansTable">Memuat...</div>`;
    const q = query(loansCol, where("userId", "==", currentUser.id));
    const loansSnap = await getDocs(q);
    if (loansSnap.empty) {
        document.getElementById("myLoansTable").innerHTML = '<div class="alert alert-info text-center">Belum ada riwayat peminjaman.</div>';
        return;
    }
    let loans = loansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    loans.sort((a, b) => new Date(b.tanggalPinjam) - new Date(a.tanggalPinjam));
    
    const booksSnap = await getDocs(booksCol);
    const bookMap = new Map(booksSnap.docs.map(d => [d.id, d.data().judul]));
    
    const todayStr = new Date().toISOString().split('T')[0];
    let html = `<div class="table-responsive"><table class="table table-bordered table-hover align-middle" style="min-width: 600px;"><thead class="table-light"><tr><th>Judul Buku</th><th>Tgl Pinjam</th><th>Jatuh Tempo</th><th>Status</th><th>Denda (Rp)</th><th>Aksi</th></tr></thead><tbody>`;
    
    for (const loan of loans) {
        const bookTitle = bookMap.get(loan.bookId) || "-";
        const isActive = loan.status === 'active';
        const { denda } = hitungDenda(loan.tanggalJatuhTempo, todayStr);
        const dendaTampil = (isActive && denda > 0) ? denda : 0;
        const statusBadge = isActive ? '<span class="badge bg-warning">Dipinjam</span>' : '<span class="badge bg-success">Dikembalikan</span>';
        const dendaText = dendaTampil > 0 ? `<span class="text-danger fw-bold">Rp ${dendaTampil.toLocaleString()}</span>` : '-';
        const actionButtons = isActive ? `
            <button class="btn btn-sm btn-outline-primary return-book me-1" data-id="${loan.id}" data-book="${loan.bookId}"><i class="fas fa-undo-alt"></i> Kembalikan</button>
        ` : '-';
        html += `<tr>
            <td><strong>${escapeHtml(bookTitle)}</strong></td>
            <td>${loan.tanggalPinjam}</td>
            <td>${loan.tanggalJatuhTempo}</td>
            <td>${statusBadge}</td>
            <td>${dendaText}</td>
            <td>${actionButtons}</td>
        </tr>`;
    }
    html += `</tbody></table></div>`;
    document.getElementById("myLoansTable").innerHTML = html;
    
    // Pasang event listener untuk tombol kembali
    document.querySelectorAll(".return-book").forEach(btn => btn.addEventListener("click", async () => {
        if (await safeReturnBook(btn.dataset.id, btn.dataset.book)) {
            loadMyLoans();
            if (currentUser.role !== 'admin') loadBorrowBooks();
        }
    }));
}

// ==================== ADMIN: MANAJEMEN BUKU ====================
async function loadBooksAdmin() { 
    const container = document.getElementById("dynamicContent"); 
    container.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-3"><h4><i class="fas fa-book text-primary"></i> Manajemen Buku</h4><button class="btn btn-primary rounded-pill" id="addBookBtn"><i class="fas fa-plus"></i> Tambah Buku</button></div><div class="mb-3"><input type="text" class="form-control rounded-pill" id="searchBook" placeholder="🔍 Cari..."></div><div class="card-table" id="booksTable">Memuat...</div>`; 
    await renderBooksTable(""); 
    document.getElementById("searchBook").addEventListener("keyup", (e) => renderBooksTable(e.target.value)); 
    document.getElementById("addBookBtn").onclick = () => showBookModal(); 
}

async function renderBooksTable(search = "") { 
    const snapshot = await getDocs(query(booksCol, orderBy("judul"))); 
    let books = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
    if (search) books = books.filter(b => b.judul.toLowerCase().includes(search.toLowerCase()) || b.penerbit.toLowerCase().includes(search.toLowerCase())); 
    let html = `<div class="table-responsive"><table class="table table-hover align-middle"><thead class="table-light"><tr><th>Judul</th><th>Penerbit</th><th>Kategori</th><th>Stok</th><th>Tersedia</th><th>Aksi</th></tr></thead><tbody>`; 
    books.forEach(book => { html += `<tr>
        <td><strong>${escapeHtml(book.judul)}</strong></td>
        <td>${escapeHtml(book.penerbit)}</td>
        <td>${escapeHtml(book.kategori)}</td>
        <td>${book.stokTotal}</td>
        <td><span class="badge bg-success">${book.tersedia}</span></td>
        <td><button class="btn btn-sm btn-outline-primary edit-book" data-id="${book.id}"><i class="fas fa-edit"></i> Edit</button> <button class="btn btn-sm btn-outline-danger delete-book" data-id="${book.id}"><i class="fas fa-trash-alt"></i> Hapus</button></td>
    </tr>`; }); 
    html += `</tbody></table></div>`; 
    document.getElementById("booksTable").innerHTML = html; 
    document.querySelectorAll(".edit-book").forEach(btn => btn.addEventListener("click", () => showBookModal(btn.dataset.id))); 
    document.querySelectorAll(".delete-book").forEach(btn => btn.addEventListener("click", async () => { if (await Swal.fire({ title: "Hapus Buku?", icon: "warning", showCancelButton: true }).then(res => res.isConfirmed)) { await deleteDoc(doc(db, "books", btn.dataset.id)); toast("success", "Buku dihapus"); renderBooksTable(document.getElementById("searchBook")?.value || ""); } })); 
}

async function showBookModal(bookId = null) { 
    let bookData = { judul: "", penerbit: "", kategori: "", stokTotal: 1 }; 
    if (bookId) { const snap = await getDoc(doc(db, "books", bookId)); if (snap.exists()) bookData = snap.data(); } 
    const { value: form } = await Swal.fire({ 
        title: bookId ? "Edit Buku" : "Tambah Buku", 
        html: `<input id="judul" class="swal2-input" placeholder="Judul" value="${escapeHtml(bookData.judul)}"><input id="penerbit" class="swal2-input" placeholder="Penerbit" value="${escapeHtml(bookData.penerbit)}"><input id="kategori" class="swal2-input" placeholder="Kategori" value="${escapeHtml(bookData.kategori)}"><input id="stok" type="number" class="swal2-input" placeholder="Stok Total" value="${bookData.stokTotal}">`, 
        preConfirm: () => ({ judul: document.getElementById("judul").value, penerbit: document.getElementById("penerbit").value, kategori: document.getElementById("kategori").value, stokTotal: parseInt(document.getElementById("stok").value), tersedia: parseInt(document.getElementById("stok").value) }) 
    }); 
    if (form && form.judul) { 
        if (bookId) await updateDoc(doc(db, "books", bookId), { ...form, tersedia: form.stokTotal }); 
        else await addDoc(booksCol, form); 
        toast("success", bookId ? "Buku diperbarui" : "Buku ditambahkan"); 
        renderBooksTable(document.getElementById("searchBook")?.value || ""); 
    } 
}

// ==================== ADMIN: MANAJEMEN ANGGOTA ====================
async function loadMembersAdmin() { 
    const container = document.getElementById("dynamicContent"); 
    container.innerHTML = `<div class="d-flex justify-content-between mb-3"><h4><i class="fas fa-users text-primary"></i> Daftar Anggota</h4><button class="btn btn-primary rounded-pill" id="addMemberBtn"><i class="fas fa-user-plus"></i> Tambah Anggota</button></div><div class="card-table" id="membersTable">Memuat...</div>`; 
    await renderMembersTable(); 
    document.getElementById("addMemberBtn").onclick = () => showMemberModal(); 
}

async function renderMembersTable() { 
    const snap = await getDocs(query(usersCol, where("role", "==", "user"))); 
    let html = `<div class="table-responsive"><table class="table table-hover align-middle"><thead class="table-light"><tr><th>Nama</th><th>Email</th><th>Kelas</th><th>Tgl Daftar</th><th>Aksi</th></tr></thead><tbody>`; 
    snap.forEach(docSnap => { const u = docSnap.data(); html += `<tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.kelas)}</td>
        <td>${u.tanggalDaftar || '-'}</td>
        <td><button class="btn btn-sm btn-outline-primary edit-member" data-id="${docSnap.id}"><i class="fas fa-edit"></i> Edit</button> <button class="btn btn-sm btn-outline-danger delete-member" data-id="${docSnap.id}"><i class="fas fa-trash-alt"></i> Hapus</button></td>
    </tr>`; }); 
    html += `</tbody></table></div>`; 
    document.getElementById("membersTable").innerHTML = html; 
    document.querySelectorAll(".edit-member").forEach(btn => btn.addEventListener("click", () => showMemberModal(btn.dataset.id))); 
    document.querySelectorAll(".delete-member").forEach(btn => btn.addEventListener("click", async () => { if (await Swal.fire({ title: "Hapus Anggota?", icon: "warning", showCancelButton: true }).then(res => res.isConfirmed)) { await deleteDoc(doc(db, "users", btn.dataset.id)); toast("success", "Anggota dihapus"); renderMembersTable(); } })); 
}

async function showMemberModal(memberId = null) { 
    let member = { name: "", email: "", kelas: "", password: "siswa123" }; 
    if (memberId) { const snap = await getDoc(doc(db, "users", memberId)); if (snap.exists()) member = snap.data(); } 
    const { value: form } = await Swal.fire({ 
        title: memberId ? "Edit Anggota" : "Tambah Anggota", 
        html: `<input id="name" class="swal2-input" placeholder="Nama" value="${escapeHtml(member.name)}"><input id="email" class="swal2-input" placeholder="Email" value="${escapeHtml(member.email)}"><input id="kelas" class="swal2-input" placeholder="Kelas" value="${escapeHtml(member.kelas)}"><div style="position:relative"><input id="password" type="password" class="swal2-input" placeholder="Password" value="${member.password}" style="padding-right:40px"><i class="fas fa-eye-slash" id="togglePass" style="position:absolute; right:20px; top:50%; transform:translateY(-50%); cursor:pointer"></i></div>`, 
        preConfirm: () => { const email = document.getElementById("email").value; if (!isValidEmail(email)) return Swal.showValidationMessage("Email tidak valid!"); return { name: document.getElementById("name").value, email, kelas: document.getElementById("kelas").value, password: document.getElementById("password").value, role: "user", tanggalDaftar: new Date().toISOString().split('T')[0] }; }, 
        didOpen: () => { const toggleIcon = document.getElementById("togglePass"); const passInput = document.getElementById("password"); if (toggleIcon && passInput) { toggleIcon.addEventListener("click", () => { const type = passInput.type === "password" ? "text" : "password"; passInput.type = type; toggleIcon.classList.toggle("fa-eye-slash"); toggleIcon.classList.toggle("fa-eye"); }); } } 
    }); 
    if (form && form.name) { 
        if (memberId) await updateDoc(doc(db, "users", memberId), form); 
        else await addDoc(usersCol, form); 
        toast("success", memberId ? "Anggota diperbarui" : "Anggota ditambahkan"); 
        renderMembersTable(); 
    } 
}

// ==================== USER: PEMINJAMAN BUKU ====================
async function loadBorrowBooks() { 
    const container = document.getElementById("dynamicContent"); 
    container.innerHTML = `<h4><i class="fas fa-search text-primary"></i> Katalog Buku Tersedia</h4><input type="text" id="searchBorrow" class="form-control rounded-pill my-3" placeholder="Cari judul, penerbit..."><div class="card-table" id="borrowList">Memuat...</div>`; 
    await renderBorrowList(""); 
    document.getElementById("searchBorrow").addEventListener("keyup", (e) => renderBorrowList(e.target.value)); 
}

async function renderBorrowList(search = "") { 
    const snap = await getDocs(query(booksCol, orderBy("judul"))); 
    let books = snap.docs.map(d => ({ id: d.id, ...d.data() })); 
    if (search) books = books.filter(b => b.judul.toLowerCase().includes(search.toLowerCase()) || b.penerbit.toLowerCase().includes(search.toLowerCase())); 
    let html = `<div class="table-responsive"><table class="table align-middle"><thead class="table-light"><tr><th>Judul</th><th>Penerbit</th><th>Kategori</th><th>Tersedia</th><th>Aksi</th></tr></thead><tbody>`; 
    books.forEach(book => { html += `<tr>
        <td>${escapeHtml(book.judul)}</td>
        <td>${escapeHtml(book.penerbit)}</td>
        <td>${escapeHtml(book.kategori)}</td>
        <td>${book.tersedia}</td>
        <td>${book.tersedia > 0 ? `<button class="btn btn-sm btn-success borrow-act" data-id="${book.id}" data-title="${escapeHtml(book.judul)}"><i class="fas fa-hand-holding-heart"></i> Pinjam</button>` : '<span class="badge bg-secondary">Stok Habis</span>'}</td>
    </tr>`; }); 
    html += `</tbody></table></div>`; 
    document.getElementById("borrowList").innerHTML = html; 
    document.querySelectorAll(".borrow-act").forEach(btn => btn.addEventListener("click", async () => { 
        const bookId = btn.dataset.id, title = btn.dataset.title; 
        const bookRef = doc(db, "books", bookId); 
        const bookSnap = await getDoc(bookRef); 
        if (!bookSnap.exists() || bookSnap.data().tersedia <= 0) { toast("error", "Stok habis"); return; } 
        const due = new Date(); due.setDate(due.getDate() + 7); 
        await addDoc(loansCol, { userId: currentUser.id, bookId, tanggalPinjam: new Date().toISOString().split('T')[0], tanggalJatuhTempo: due.toISOString().split('T')[0], status: "active" }); 
        await updateDoc(bookRef, { tersedia: bookSnap.data().tersedia - 1 }); 
        toast("success", `Berhasil meminjam "${title}"`, "Jatuh tempo 7 hari"); 
        loadBorrowBooks(); 
    })); 
}

// ==================== UTILITY HTML ESCAPE ====================
function escapeHtml(str) { return str?.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])) || ""; }

// ==================== MENAMPILKAN DASHBOARD BERDASARKAN ROLE ====================
function showDashboard() {
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("dashboardPage").style.display = "block";
    document.getElementById("userNameTop").innerText = currentUser.name;
    document.getElementById("userBadge").innerHTML = currentUser.role === "admin" ? "Admin" : "Siswa";
    document.getElementById("welcomeUser").innerHTML = `📚 Halo, ${currentUser.name.split(' ')[0]}`;
    document.getElementById("userRoleSpan").innerHTML = currentUser.role === "admin" ? "Panel Administrator" : `Kelas: ${currentUser.kelas || '-'}`;
    const menuContainer = document.getElementById("menuSidebar");
    // Menu berbeda untuk admin dan user biasa
    menuContainer.innerHTML = currentUser.role === "admin" ? 
        `<a href="#" class="nav-link" data-menu="books"><i class="fas fa-book"></i><span> 📚 Data Buku</span></a><a href="#" class="nav-link" data-menu="members"><i class="fas fa-users"></i><span> 👥 Anggota</span></a><a href="#" class="nav-link" data-menu="loans"><i class="fas fa-exchange-alt"></i><span> 📋 Transaksi Peminjaman</span></a>` : 
        `<a href="#" class="nav-link" data-menu="borrow"><i class="fas fa-hand-holding-heart"></i><span> 📖 Pinjam Buku</span></a><a href="#" class="nav-link" data-menu="myreturns"><i class="fas fa-undo-alt"></i><span> 🔄 Pengembalian Saya</span></a>`;
    document.querySelectorAll("[data-menu]").forEach(el => { 
        el.addEventListener("click", (e) => { e.preventDefault(); const menu = el.dataset.menu; 
            if (menu === "books") loadBooksAdmin(); 
            if (menu === "members") loadMembersAdmin(); 
            if (menu === "loans") loadAllTransactions(); 
            if (menu === "borrow") loadBorrowBooks(); 
            if (menu === "myreturns") loadMyLoans(); 
        }); 
    });
    if (currentUser.role === "admin") loadBooksAdmin(); else loadBorrowBooks();
    document.getElementById("logoutBtn").onclick = logout;
}

// ==================== EVENT LISTENER UNTUK MODAL REGISTRASI ====================
const toggleRegPass = document.getElementById("toggleRegPassCustom");
const regPasswordInput = document.getElementById("regPasswordCustom");
if (toggleRegPass && regPasswordInput) {
    toggleRegPass.addEventListener("click", () => {
        const type = regPasswordInput.type === "password" ? "text" : "password";
        regPasswordInput.type = type;
        toggleRegPass.classList.toggle("fa-eye-slash");
        toggleRegPass.classList.toggle("fa-eye");
    });
}

const modal = document.getElementById("registerModal");
const openModalBtn = document.getElementById("btnRegister");
const closeModalBtn = document.getElementById("closeModalBtn");
function openModal() { modal.classList.add("active"); document.body.style.overflow = "hidden"; document.getElementById("regNameCustom").value = ""; document.getElementById("regEmailCustom").value = ""; document.getElementById("regKelasCustom").value = ""; document.getElementById("regPasswordCustom").value = ""; }
function closeModal() { modal.classList.remove("active"); document.body.style.overflow = ""; }
openModalBtn.addEventListener("click", openModal);
closeModalBtn.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.getElementById("registerFormCustom").addEventListener("submit", async (e) => { e.preventDefault(); const name = document.getElementById("regNameCustom").value.trim(); const email = document.getElementById("regEmailCustom").value.trim(); const kelas = document.getElementById("regKelasCustom").value.trim(); const password = document.getElementById("regPasswordCustom").value; const success = await registerMember(name, email, kelas, password); if (success) { closeModal(); document.getElementById("loginEmail").value = email; } });

// Toggle password pada form login
document.getElementById("toggleLoginPass").addEventListener("click", function() { const input = document.getElementById("loginPass"); input.type = input.type === "password" ? "text" : "password"; this.classList.toggle("fa-eye-slash"); this.classList.toggle("fa-eye"); });
document.getElementById("formLogin").addEventListener("submit", async (e) => { e.preventDefault(); await login(document.getElementById("loginEmail").value, document.getElementById("loginPass").value); });

// Inisialisasi awal: seed data dan cek session
(async () => { await seedInitialData(); if (!checkSession()) { document.getElementById("loginPage").style.display = "flex"; document.getElementById("dashboardPage").style.display = "none"; } })();