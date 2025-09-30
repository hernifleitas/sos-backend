// Configuración
const API_BASE_URL = window.location.origin;
let userToken = null;
let mercadoPago = null;

// Inicializar MercadoPago (reemplaza con tu Public Key)
const MP_PUBLIC_KEY = 'TEST-tu-public-key-aqui'; // TODO: Reemplazar con tu clave real
mercadoPago = new MercadoPago(MP_PUBLIC_KEY);

// Elementos del DOM
const subscribeBtn = document.getElementById('subscribe-btn');
const loginSection = document.getElementById('login-section');
const paymentSection = document.getElementById('payment-section');
const successSection = document.getElementById('success-section');
const loginForm = document.getElementById('login-form');

// Event listeners
subscribeBtn.addEventListener('click', handleSubscribeClick);
loginForm.addEventListener('submit', handleLogin);

// Verificar si ya hay un token guardado
window.addEventListener('load', () => {
    const savedToken = localStorage.getItem('sos_delivery_token');
    if (savedToken) {
        userToken = savedToken;
        verifyTokenAndProceed();
    }
});

function handleSubscribeClick() {
    // Mostrar sección de login
    loginSection.style.display = 'block';
    loginSection.scrollIntoView({ behavior: 'smooth' });
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!email || !password) {
        showError('Por favor completa todos los campos');
        return;
    }
    
    try {
        setLoading(true);
        
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            userToken = data.token;
            localStorage.setItem('sos_delivery_token', userToken);
            
            // Ocultar login y mostrar pago
            loginSection.style.display = 'none';
            await initializePayment();
        } else {
            showError(data.message || 'Error al iniciar sesión');
        }
    } catch (error) {
        console.error('Error en login:', error);
        showError('Error de conexión. Intenta nuevamente.');
    } finally {
        setLoading(false);
    }
}

async function verifyTokenAndProceed() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/premium/status`, {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.isPremium) {
                // Usuario ya tiene premium
                showSuccess();
            } else {
                // Usuario válido, proceder al pago
                loginSection.style.display = 'none';
                await initializePayment();
            }
        } else {
            // Token inválido
            localStorage.removeItem('sos_delivery_token');
            userToken = null;
        }
    } catch (error) {
        console.error('Error verificando token:', error);
        localStorage.removeItem('sos_delivery_token');
        userToken = null;
    }
}

async function initializePayment() {
    try {
        setLoading(true);
        
        // Crear preferencia de pago en MercadoPago
        const preference = {
            items: [
                {
                    title: 'SOS Delivery Premium - Suscripción Mensual',
                    unit_price: 5000,
                    quantity: 1,
                    currency_id: 'ARS'
                }
            ],
            payer: {
                email: document.getElementById('email').value
            },
            back_urls: {
                success: `${window.location.origin}/premium/success`,
                failure: `${window.location.origin}/premium/failure`,
                pending: `${window.location.origin}/premium/pending`
            },
            auto_return: 'approved',
            notification_url: `${API_BASE_URL}/api/webhooks/mercadopago`
        };
        
        // Aquí deberías crear la preferencia en tu backend
        // Por ahora, simulamos la creación
        const mockPreferenceId = 'mock-preference-' + Date.now();
        
        // Crear suscripción en la base de datos
        await createSubscription(mockPreferenceId);
        
        // Mostrar sección de pago
        paymentSection.style.display = 'block';
        paymentSection.scrollIntoView({ behavior: 'smooth' });
        
        // Crear botón de MercadoPago
        createMercadoPagoButton(mockPreferenceId);
        
    } catch (error) {
        console.error('Error inicializando pago:', error);
        showError('Error al inicializar el pago. Intenta nuevamente.');
    } finally {
        setLoading(false);
    }
}

async function createSubscription(preferenceId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/premium/create-subscription`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({ preference_id: preferenceId })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Error creando suscripción');
        }
        
        return data.subscription;
    } catch (error) {
        console.error('Error creando suscripción:', error);
        throw error;
    }
}

function createMercadoPagoButton(preferenceId) {
    const buttonContainer = document.getElementById('mercadopago-button');
    buttonContainer.innerHTML = '';
    
    // Por ahora, crear un botón simulado
    // En producción, usarías: mercadoPago.checkout({ preference: { id: preferenceId } })
    const mockButton = document.createElement('button');
    mockButton.textContent = '💳 Pagar con MercadoPago';
    mockButton.className = 'mp-button';
    mockButton.style.cssText = `
        background: #009ee3;
        color: white;
        border: none;
        padding: 15px 30px;
        border-radius: 10px;
        font-size: 1.1rem;
        font-weight: bold;
        cursor: pointer;
        width: 100%;
        margin: 20px 0;
    `;
    
    mockButton.addEventListener('click', () => {
        // Simular pago exitoso para testing
        setTimeout(() => {
            showSuccess();
        }, 2000);
    });
    
    buttonContainer.appendChild(mockButton);
}

function showSuccess() {
    loginSection.style.display = 'none';
    paymentSection.style.display = 'none';
    successSection.style.display = 'block';
    successSection.scrollIntoView({ behavior: 'smooth' });
}

function showError(message) {
    // Remover errores anteriores
    const existingErrors = document.querySelectorAll('.error');
    existingErrors.forEach(error => error.remove());
    
    // Crear nuevo error
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    
    // Insertar después del formulario de login
    loginForm.parentNode.insertBefore(errorDiv, loginForm.nextSibling);
    
    // Auto-remover después de 5 segundos
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function setLoading(isLoading) {
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        if (isLoading) {
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    });
}

function openApp() {
    // Intentar abrir la app nativa
    window.location.href = 'sosdelivery://premium-activated';
    
    // Fallback: mostrar instrucciones
    setTimeout(() => {
        alert('¡Premium activado! Abre la app SOS Delivery para disfrutar de tus nuevas funciones.');
    }, 1000);
}

// Manejar parámetros URL para respuestas de MercadoPago
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const paymentId = urlParams.get('payment_id');
    
    if (status === 'approved' && paymentId) {
        showSuccess();
    } else if (status === 'failure') {
        showError('El pago no pudo ser procesado. Intenta nuevamente.');
    } else if (status === 'pending') {
        showError('Tu pago está siendo procesado. Te notificaremos cuando esté listo.');
    }
});
