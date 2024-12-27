// Fonction pour charger les produits
async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        const products = await response.json();
        const tbody = document.getElementById('productsList');
        tbody.innerHTML = '';

        products.forEach(product => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">
                    <img src="${product.image_url}" alt="${product.name}" class="h-20 w-20 object-cover rounded">
                </td>
                <td class="px-6 py-4 whitespace-nowrap">${product.name}</td>
                <td class="px-6 py-4 whitespace-nowrap">${product.price} HTG</td>
                <td class="px-6 py-4 whitespace-nowrap">${product.stock}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <button onclick="editProduct(${JSON.stringify(product).replace(/"/g, '&quot;')})"
                        class="text-blue-600 hover:text-blue-900 mr-3">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteProduct(${product.id})"
                        class="text-red-600 hover:text-red-900">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        alert('Erreur lors du chargement des produits');
        console.error(err);
    }
}

// Gestion du formulaire d'ajout de produit
document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            alert('Produit ajouté avec succès');
            e.target.reset();
            loadProducts();
        } else {
            throw new Error('Erreur lors de l\'ajout du produit');
        }
    } catch (err) {
        alert(err.message);
        console.error(err);
    }
});

// Fonction pour supprimer un produit
async function deleteProduct(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) {
        return;
    }

    try {
        const response = await fetch(`/api/products/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert('Produit supprimé avec succès');
            loadProducts();
        } else {
            throw new Error('Erreur lors de la suppression du produit');
        }
    } catch (err) {
        alert(err.message);
        console.error(err);
    }
}

// Fonction pour ouvrir le modal de modification
function editProduct(product) {
    const modal = document.getElementById('editModal');
    const form = document.getElementById('editForm');

    // Remplir le formulaire avec les données du produit
    form.querySelector('[name="productId"]').value = product.id;
    form.querySelector('[name="name"]').value = product.name;
    form.querySelector('[name="price"]').value = product.price;
    form.querySelector('[name="stock"]').value = product.stock;
    form.querySelector('[name="description"]').value = product.description;

    modal.classList.remove('hidden');
}

// Fonction pour fermer le modal de modification
function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
}

// Gestion du formulaire de modification
document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const productId = formData.get('productId');

    try {
        const response = await fetch(`/api/products/${productId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: formData.get('name'),
                price: formData.get('price'),
                stock: formData.get('stock'),
                description: formData.get('description')
            })
        });

        if (response.ok) {
            alert('Produit mis à jour avec succès');
            closeEditModal();
            loadProducts();
        } else {
            throw new Error('Erreur lors de la mise à jour du produit');
        }
    } catch (err) {
        alert(err.message);
        console.error(err);
    }
});

// Charger les produits au chargement de la page
document.addEventListener('DOMContentLoaded', loadProducts);
