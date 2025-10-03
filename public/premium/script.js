document.addEventListener('DOMContentLoaded', function() {
    // Elementos de la interfaz
    const activatePremiumBtn = document.getElementById('activatePremiumBtn');
    const premiumExpiry = document.getElementById('premiumExpiry');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('sos_delivery_token')}`
    };

    // Verificar estado premium al cargar la página
    checkPremiumStatus();

    // Configurar evento del botón
    if (activatePremiumBtn) {
        activatePremiumBtn.addEventListener('click', handleActivatePremium);
    }

    // Función para verificar el estado premium
    async function checkPremiumStatus() {
        try {
            const response = await fetch('/api/premium/status', {
                headers: headers
            });
            
            if (!response.ok) {
                throw new Error('Error al verificar estado premium');
            }

            const data = await response.json();
            
            if (data.isPremium) {
                updatePremiumUI(data.expiresAt);
            }
        } catch (error) {
            console.error('Error verificando estado premium:', error);
        }
    }

    // Función para actualizar la interfaz de usuario
    function updatePremiumUI(expiresAt) {
        if (activatePremiumBtn) {
            activatePremiumBtn.innerHTML = '<i class="fas fa-crown"></i> ¡Ya eres Premium!';
            activatePremiumBtn.disabled = true;
        }

        if (premiumExpiry && expiresAt) {
            const expiryDate = new Date(expiresAt).toLocaleDateString();
            premiumExpiry.textContent = `Válido hasta: ${expiryDate}`;
            premiumExpiry.style.display = 'block';
        }
    }

    // Función para mostrar notificaciones
    function showNotification(message, type = 'info') {
        // Usa SweetAlert2 si está disponible, si no, usa alert nativo
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: type,
                text: message,
                timer: 3000,
                showConfirmButton: false
            });
        } else {
            alert(message);
        }
    }

    // Función para manejar la activación de premium
    async function handleActivatePremium() {
        try {
            setLoading(true);
            showNotification('Procesando tu solicitud...', 'info');

            // 1. Crear preferencia de pago
            const response = await fetch('/api/premium/create-subscription', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({})
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Error al crear la preferencia de pago');
            }

            // 2. Configurar MercadoPago
            const mp = new MercadoPago('APP_USR-18f706ac-5e7b-4cc1-9517-5a9bedec7b9c', {
                locale: 'es-AR'
            });

            // 3. Abrir checkout
            mp.checkout({
                preference: {
                    id: data.preferenceId
                },
                autoOpen: true,
                theme: {
                    elementsColor: '#2D9CDB',
                    headerColor: '#2D9CDB'
                }
            });

            // 4. Escuchar eventos de pago exitoso
            document.addEventListener('payment_success', async (event) => {
                try {
                    await handlePaymentSuccess(event.detail);
                    showNotification('¡Pago exitoso! Activando tu suscripción...', 'success');
                    setTimeout(() => {
                        window.location.href = '/premium/success';
                    }, 2000);
                } catch (error) {
                    console.error('Error al procesar pago:', error);
                    showNotification('Error al procesar el pago: ' + error.message, 'error');
                }
            });

        } catch (error) {
            console.error('Error al activar premium:', error);
            showNotification('Error: ' + (error.message || 'Error al procesar la solicitud'), 'error');
        } finally {
            setLoading(false);
        }
    }

    // Función para manejar el éxito del pago
    async function handlePaymentSuccess(paymentData) {
        try {
            const response = await fetch('/api/premium/activate-manual', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    months: 1
                })
            });

            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.message || 'Error al activar premium');
            }

            // Actualizar UI
            updatePremiumUI(result.expiresAt);
            return result;

        } catch (error) {
            console.error('Error al procesar el pago:', error);
            throw error;
        }
    }

    // Función para mostrar/ocultar el spinner de carga
    function setLoading(isLoading) {
        if (loadingSpinner) {
            loadingSpinner.style.display = isLoading ? 'block' : 'none';
        }
        if (activatePremiumBtn) {
            activatePremiumBtn.disabled = isLoading;
        }
    }

    // Verificar si estamos en la página de éxito
    if (window.location.pathname.includes('success')) {
        handleSuccessPage();
    }

    // Manejar la página de éxito
    async function handleSuccessPage() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const paymentId = urlParams.get('payment_id');
            const status = urlParams.get('status');

            if (status === 'approved' && paymentId) {
                document.getElementById('successMessage').style.display = 'block';
                await handlePaymentSuccess({ id: paymentId });
                
                // Redirigir después de 5 segundos
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 5000);
            }
        } catch (error) {
            console.error('Error en página de éxito:', error);
            document.getElementById('errorMessage').style.display = 'block';
        }
    }
});