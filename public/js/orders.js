// Fonction pour formater la date
function formatDate(dateString) {
    return new Date(dateString).toLocaleString('fr-FR');
}

// Fonction pour charger les commandes
async function loadOrders() {
    try {
        const response = await fetch('/api/orders');
        const orders = await response.json();
        const tbody = document.getElementById('ordersList');
        tbody.innerHTML = '';

        orders.forEach(order => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">#${order.id}</td>
                <td class="px-6 py-4 whitespace-nowrap">${order.customer_name}</td>
                <td class="px-6 py-4">
                    ${JSON.parse(order.products).length} articles
                </td>
                <td class="px-6 py-4 whitespace-nowrap">${order.total_amount} HTG</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                          order.status === 'completed' ? 'bg-green-100 text-green-800' : 
                          'bg-gray-100 text-gray-800'}">
                        ${order.status}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">${formatDate(order.created_at)}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <button onclick='showOrderDetails(${JSON.stringify(order).replace(/"/g, '&quot;')})'
                        class="text-blue-600 hover:text-blue-900">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        alert('Erreur lors du chargement des commandes');
        console.error(err);
    }
}

// Fonction pour afficher les détails d'une commande
function showOrderDetails(order) {
    const modal = document.getElementById('orderModal');
    const detailsDiv = document.getElementById('orderDetails');
    const products = JSON.parse(order.products);

    detailsDiv.innerHTML = `
        <div class="grid grid-cols-2 gap-4">
            <div>
                <p class="text-sm font-medium text-gray-500">Client</p>
                <p class="mt-1">${order.customer_name}</p>
            </div>
            <div>
                <p class="text-sm font-medium text-gray-500">Date de commande</p>
                <p class="mt-1">${formatDate(order.created_at)}</p>
            </div>
            <div>
                <p class="text-sm font-medium text-gray-500">Adresse</p>
                <p class="mt-1">${order.address}</p>
            </div>
            <div>
                <p class="text-sm font-medium text-gray-500">Statut</p>
                <p class="mt-1">${order.status}</p>
            </div>
        </div>

        <div class="mt-6">
            <h4 class="text-sm font-medium text-gray-500">Produits commandés</h4>
            <table class="mt-2 min-w-full divide-y divide-gray-200">
                <thead>
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produit</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantité</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prix unitaire</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${products.map(product => `
                        <tr>
                            <td class="px-6 py-4">${product.name}</td>
                            <td class="px-6 py-4">${product.quantity}</td>
                            <td class="px-6 py-4">${product.price} HTG</td>
                            <td class="px-6 py-4">${product.price * product.quantity} HTG</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" class="px-6 py-4 text-right font-medium">Total</td>
                        <td class="px-6 py-4 font-medium">${order.total_amount} HTG</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;

    modal.classList.remove('hidden');
}

// Fonction pour fermer le modal des détails de commande
function closeOrderModal() {
    document.getElementById('orderModal').classList.add('hidden');
}

// Charger les commandes au chargement de la page
document.addEventListener('DOMContentLoaded', loadOrders);
