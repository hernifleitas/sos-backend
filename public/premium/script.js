document.addEventListener('DOMContentLoaded', function () {
    // Elementos del DOM
    const activatePremiumBtn = document.getElementById('activatePremiumBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const statusMessage = document.getElementById('statusMessage');
    const premiumExpiry = document.getElementById('premiumExpiry');

    // Obtener token de query params si viene desde la app
    const urlParamsApp = new URLSearchParams(window.location.search);
    const tokenFromApp = urlParamsApp.get('token');
    if (tokenFromApp) {
        localStorage.setItem('sos_delivery_token', tokenFromApp);
    }

    // Verificar si el usuario está autenticado
    const token = localStorage.getItem('sos_delivery_token');
    if (!token) {
        // Redirigir al login si no hay token
        window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
        return;
    }

    // Configurar headers para las peticiones
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    // Función para mostrar/ocultar loading
    function setLoading(loading) {
        loadingOverlay.style.display = loading ? 'flex' : 'none';
    }

    // Función para mostrar mensajes de estado
    function showMessage(message, isError = false) {
        statusMessage.textContent = message;
        statusMessage.className = isError ? 'error' : 'success';
        statusMessage.style.display = 'block';

        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    }

    // Función para verificar el estado premium
    async function checkPremiumStatus() {
        try {
            const response = await fetch('/api/premium/status', { headers });
            const data = await response.json();

            if (data.isPremium) {
                activatePremiumBtn.innerHTML = '<i class="fas fa-crown"></i> ¡Ya eres Premium!';
                activatePremiumBtn.disabled = true;

                if (data.expiresAt) {
                    const expiryDate = new Date(data.expiresAt).toLocaleDateString();
                    premiumExpiry.textContent = `Válido hasta: ${expiryDate}`;
                    premiumExpiry.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Error verificando estado premium:', error);
        }
    }

    // Manejar clic en el botón de activar premium
    async function handleActivatePremium() {
        try {
            setLoading(true);

            // Crear preferencia de pago en el backend
            const response = await fetch('/api/premium/create-subscription', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({})
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Error al crear la preferencia de pago');

            // Redirigir a MercadoPago
            if (data.init_point) {
                window.location.href = data.init_point;
            } else if (data.preferenceId) {
                window.location.href = `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${data.preferenceId}`;
            }

        } catch (error) {
            console.error('Error al activar premium:', error);
            showMessage(error.message || 'Error al procesar el pago. Intenta nuevamente.', true);
        } finally {
            setLoading(false);
        }
    }

    // Verificar si hay parámetros de MercadoPago en la URL
    async function handleMPRedirect() {
        const urlParams = new URLSearchParams(window.location.search);
        const status = urlParams.get('status');
    
        if (status === 'approved') {
            setLoading(true);
            showMessage('¡Pago exitoso! Tu cuenta se activará automáticamente.');
            await checkPremiumStatus(); // refresca estado del usuario
            setLoading(false);
    
            // Limpiar query params para que no se repita al refrescar
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    // Inicializar
    checkPremiumStatus();
    if (activatePremiumBtn) activatePremiumBtn.addEventListener('click', handleActivatePremium);
    handleMPRedirect(); // Detecta pago aprobado de MercadoPago
});
