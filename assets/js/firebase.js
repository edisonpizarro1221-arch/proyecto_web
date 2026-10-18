// Firebase SDK centralizado. La autorización de operaciones debe imponerse en las reglas de Firestore.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const firebaseConfig = {
            apiKey: "AIzaSyCyiZpvXt9XaRs31i5SHH1RTqjLc0K7mdA",
            authDomain: "smart-access-lab.firebaseapp.com",
            projectId: "smart-access-lab",
            storageBucket: "smart-access-lab.firebasestorage.app",
            messagingSenderId: "260498911495",
            appId: "1:260498911495:web:589a02e937aa896c6755a2",
            measurementId: "G-RN75VDHMZ8"
        };

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
