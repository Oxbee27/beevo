import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCustomers } from '../../customers/services/customer.service.js'
import {
  addProductInterest,
  archiveProduct,
  createProduct,
  getProductInterests,
  getProducts,
  updateProduct,
  updateProductInterest,
} from '../services/product.service.js'

const inputClass =
  'mt-2 w-full rounded-lg border border-inkberry/15 bg-white px-3.5 py-3 text-sm text-inkberry outline-none placeholder:text-inkberry/35 focus:border-inkberry/60'

function ProductDialog({ product, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: product?.name || '',
    sku: product?.sku || '',
    description: product?.description || '',
    stockQuantity: String(product?.stock_quantity ?? 0),
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function change(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')

    const name = form.name.trim()
    const quantity = Number(form.stockQuantity)

    if (name.length < 2) {
      setError('Enter a product name with at least two characters.')
      return
    }

    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      setError('Stock quantity must be a whole number of zero or more.')
      return
    }

    setSaving(true)

    try {
      const data = {
        name,
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
        stockQuantity: quantity,
      }

      if (product) {
        await updateProduct(product.id, data)
      } else {
        await createProduct(data)
      }

      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'We could not save this product. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-inkberry/35 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-dialog-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-inkberry/10 bg-warm-ivory p-4 shadow-xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-inkberry/45">
              Product inventory
            </p>
            <h2 id="product-dialog-title" className="mt-1 text-xl font-semibold text-inkberry">
              {product ? 'Edit product' : 'Add a product'}
            </h2>
            <p className="mt-2 text-sm text-inkberry/60">
              Keep product details and available stock up to date.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close dialog"
            className="rounded-lg px-2 py-1 text-xl text-inkberry/50 hover:bg-peach-sand/60"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="product-name" className="text-sm font-medium text-inkberry">
              Product name *
            </label>
            <input
              id="product-name"
              name="name"
              value={form.name}
              onChange={change}
              required
              minLength={2}
              maxLength={180}
              placeholder="Enter product name"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="product-sku" className="text-sm font-medium text-inkberry">
              SKU
            </label>
            <input
              id="product-sku"
              name="sku"
              value={form.sku}
              onChange={change}
              maxLength={100}
              placeholder="Optional product code"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="product-description" className="text-sm font-medium text-inkberry">
              Description
            </label>
            <textarea
              id="product-description"
              name="description"
              value={form.description}
              onChange={change}
              rows={3}
              maxLength={5000}
              placeholder="Describe this product"
              className={`${inputClass} resize-y`}
            />
          </div>

          <div>
            <label htmlFor="product-stock" className="text-sm font-medium text-inkberry">
              Stock quantity *
            </label>
            <input
              id="product-stock"
              name="stockQuantity"
              type="number"
              min="0"
              step="1"
              value={form.stockQuantity}
              onChange={change}
              required
              className={inputClass}
            />
            {product && (
              <p className="mt-1 text-xs text-inkberry/55">
                Increasing stock can trigger an automatic restock campaign for waiting customers.
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-peach-sand/60 px-3 py-3 text-sm text-inkberry">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-inkberry/15 px-5 py-3 text-sm font-medium text-inkberry hover:bg-peach-sand/40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory hover:bg-inkberry/90 disabled:opacity-60"
            >
              {saving ? 'Saving...' : product ? 'Save changes' : 'Add product'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function InterestsDialog({ product, onClose }) {
  const [interests, setInterests] = useState([])
  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [interestData, customerData] = await Promise.all([
        getProductInterests(product.id),
        getCustomers(),
      ])
      setInterests(interestData)
      setCustomers(customerData)
    } catch (err) {
      setError(err.message || 'We could not load the waiting list.')
    } finally {
      setLoading(false)
    }
  }, [product.id])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  async function addCustomer(event) {
    event.preventDefault()
    if (!customerId) return

    setSaving(true)
    setError('')

    try {
      await addProductInterest(product.id, customerId)
      setCustomerId('')
      await load()
    } catch (err) {
      setError(err.message || 'We could not add this customer.')
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(interestId, status) {
    setError('')
    try {
      await updateProductInterest(product.id, interestId, status)
      await load()
    } catch (err) {
      setError(err.message || 'We could not update this waiting-list entry.')
    }
  }

  function customerName(interest) {
    if (interest.customer_name) return interest.customer_name
    if (interest.customer?.name) return interest.customer.name

    const customer = customers.find(
      (item) => Number(item.id) === Number(interest.customer_id ?? interest.customerId),
    )
    return customer?.name || `Customer #${interest.customer_id ?? interest.customerId ?? ''}`
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-inkberry/35 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="interests-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-inkberry/10 bg-warm-ivory p-4 shadow-xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-inkberry/45">
              Customer demand
            </p>
            <h2 id="interests-title" className="mt-1 text-xl font-semibold text-inkberry">
              Waiting list
            </h2>
            <p className="mt-1 text-sm text-inkberry/60">{product.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg px-2 py-1 text-xl text-inkberry/50 hover:bg-peach-sand/60"
          >
            ×
          </button>
        </div>

        <form onSubmit={addCustomer} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <select
            aria-label="Choose customer"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-inkberry/15 bg-white px-3.5 py-3 text-sm text-inkberry"
          >
            <option value="">Choose a customer to add</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!customerId || saving}
            className="w-full rounded-lg bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory disabled:opacity-50 sm:w-auto"
          >
            {saving ? 'Adding...' : 'Add to list'}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-peach-sand/60 px-3 py-3 text-sm text-inkberry">
            {error}
          </p>
        )}

        <div className="mt-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-inkberry/55">Loading waiting list...</p>
          ) : interests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-inkberry/20 px-4 py-8 text-center">
              <p className="font-medium text-inkberry">No customers on this list yet</p>
              <p className="mt-1 text-sm text-inkberry/55">
                Add customers who want to be notified when this product is available.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-left text-sm">
                <thead>
                  <tr className="border-b border-inkberry/10 text-xs uppercase tracking-wide text-inkberry/50">
                    <th className="py-3 pr-3 font-semibold">Customer</th>
                    <th className="py-3 pr-3 font-semibold">Status</th>
                    <th className="py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {interests.map((interest) => (
                    <tr key={interest.id} className="border-b border-inkberry/10">
                      <td className="py-3 pr-3 font-medium text-inkberry">
                        {customerName(interest)}
                      </td>
                      <td className="py-3 pr-3 capitalize text-inkberry/65">
                        {interest.status}
                      </td>
                      <td className="py-3 text-right">
                        {interest.status === 'waiting' && (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => changeStatus(interest.id, 'converted')}
                              className="rounded-md border border-inkberry/15 px-2.5 py-1.5 text-xs font-medium text-inkberry hover:bg-peach-sand/40"
                            >
                              Converted
                            </button>
                            <button
                              type="button"
                              onClick={() => changeStatus(interest.id, 'cancelled')}
                              className="rounded-md border border-inkberry/15 px-2.5 py-1.5 text-xs font-medium text-inkberry/65 hover:bg-peach-sand/40"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-inkberry/15 px-5 py-2.5 text-sm font-medium text-inkberry hover:bg-peach-sand/40"
          >
            Close
          </button>
        </div>
      </section>
    </div>
  )
}

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialogProduct, setDialogProduct] = useState(null)
  const [showProductDialog, setShowProductDialog] = useState(false)
  const [interestsProduct, setInterestsProduct] = useState(null)
  const [archiving, setArchiving] = useState(null)

  const loadProducts = useCallback(async () => {
    setError('')
    try {
      const data = await getProducts(includeArchived)
      setProducts(data)
    } catch (err) {
      setError(err.message || 'We could not load your products. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [includeArchived])

  useEffect(() => {
    void Promise.resolve().then(loadProducts)
  }, [loadProducts])

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return products

    return products.filter((product) =>
      [product.name, product.sku, product.description]
        .some((value) => String(value || '').toLowerCase().includes(term)),
    )
  }, [products, search])

  async function handleArchive() {
    if (!archiving) return

    setError('')
    setNotice('')

    try {
      await archiveProduct(archiving.id)
      setNotice(`${archiving.name} has been archived.`)
      setArchiving(null)
      await loadProducts()
    } catch (err) {
      setError(err.message || 'We could not archive this product.')
    }
  }

  function openCreate() {
    setDialogProduct(null)
    setShowProductDialog(true)
  }

  function openEdit(product) {
    setDialogProduct(product)
    setShowProductDialog(true)
  }

  return (
    <div className="w-full min-w-0 space-y-5 pb-10 sm:space-y-6">
      <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-inkberry/45">
            Inventory management
          </p>
          <h1 className="mt-1 text-2xl font-bold text-inkberry">Products</h1>
          <p className="mt-2 text-sm text-inkberry/60">
            Manage your stock and keep track of customers waiting for products.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="w-full rounded-lg bg-inkberry px-5 py-3 text-sm font-semibold text-warm-ivory hover:bg-inkberry/90 sm:w-auto"
        >
          Add product
        </button>
      </div>

      {notice && (
        <p role="status" className="rounded-lg border border-inkberry/10 bg-white px-4 py-3 text-sm text-inkberry">
          {notice}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-peach-sand/60 px-4 py-3 text-sm text-inkberry">
          {error}
        </p>
      )}

      <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-inkberry/10 bg-white/70 p-4 sm:flex-row sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by product name, SKU or description"
          aria-label="Search products"
          className="min-w-0 flex-1 rounded-lg border border-inkberry/15 bg-white px-3.5 py-3 text-sm text-inkberry outline-none placeholder:text-inkberry/35 focus:border-inkberry/60"
        />
        <label className="flex min-h-10 items-center gap-2 text-sm text-inkberry/70">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
            className="h-4 w-4 accent-inkberry"
          />
          Include archived
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-inkberry/10 bg-white/80">
        {loading ? (
          <p className="px-5 py-12 text-center text-sm text-inkberry/55">
            Loading products...
          </p>
        ) : filteredProducts.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <h2 className="font-semibold text-inkberry">No products found</h2>
            <p className="mt-2 text-sm text-inkberry/55">
              {search ? 'Try another search term.' : 'Add your first product to start managing inventory.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={openCreate}
                className="mt-4 rounded-lg bg-inkberry px-5 py-2.5 text-sm font-semibold text-warm-ivory"
              >
                Add your first product
              </button>
            )}
          </div>
        ) : (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-peach-sand/30">
                <tr className="text-xs uppercase tracking-wide text-inkberry/55">
                  <th className="px-5 py-4 font-semibold">Product</th>
                  <th className="px-4 py-4 font-semibold">SKU</th>
                  <th className="px-4 py-4 font-semibold">Stock</th>
                  <th className="px-4 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const archived = product.is_active === false
                  const quantity = Number(product.stock_quantity ?? 0)

                  return (
                    <tr key={product.id} className="border-t border-inkberry/10">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-inkberry">{product.name}</p>
                        {product.description && (
                          <p className="mt-1 max-w-xs truncate text-xs text-inkberry/50">
                            {product.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-inkberry/65">
                        {product.sku || '—'}
                      </td>
                      <td className="px-4 py-4 font-medium tabular-nums text-inkberry">
                        {quantity.toLocaleString('en-NG')}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          archived
                            ? 'bg-inkberry/10 text-inkberry/60'
                            : quantity === 0
                              ? 'bg-peach-sand text-inkberry'
                              : 'bg-[#e9f1e9] text-[#365b3d]'
                        }`}>
                          {archived ? 'Archived' : quantity === 0 ? 'Out of stock' : 'In stock'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {!archived && (
                            <>
                              <button
                                type="button"
                                onClick={() => setInterestsProduct(product)}
                                className="rounded-md border border-inkberry/15 px-2.5 py-2 text-xs font-medium text-inkberry hover:bg-peach-sand/40"
                              >
                                Waiting list
                              </button>
                              <button
                                type="button"
                                onClick={() => openEdit(product)}
                                className="rounded-md border border-inkberry/15 px-2.5 py-2 text-xs font-medium text-inkberry hover:bg-peach-sand/40"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setArchiving(product)}
                                className="rounded-md border border-inkberry/15 px-2.5 py-2 text-xs font-medium text-inkberry/65 hover:bg-peach-sand/40"
                              >
                                Archive
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredProducts.length > 0 && (
          <div className="divide-y divide-inkberry/10 md:hidden">
            {filteredProducts.map((product) => {
              const archived = product.is_active === false
              const quantity = Number(product.stock_quantity ?? 0)

              return (
                <article key={product.id} className="min-w-0 space-y-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="min-w-0 break-words font-semibold text-inkberry">
                        {product.name}
                      </h3>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                        archived
                          ? 'bg-inkberry/10 text-inkberry/60'
                          : quantity === 0
                            ? 'bg-peach-sand text-inkberry'
                            : 'bg-[#e9f1e9] text-[#365b3d]'
                      }`}>
                        {archived ? 'Archived' : quantity === 0 ? 'Out of stock' : 'In stock'}
                      </span>
                    </div>
                    {product.description && (
                      <p className="mt-1 break-words text-sm leading-5 text-inkberry/55">
                        {product.description}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-lg bg-peach-sand/25 p-3">
                    <div className="min-w-0">
                      <p className="text-xs text-inkberry/50">SKU</p>
                      <p className="mt-1 break-all text-sm font-medium text-inkberry">
                        {product.sku || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-inkberry/50">Stock quantity</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-inkberry">
                        {quantity.toLocaleString('en-NG')}
                      </p>
                    </div>
                  </div>

                  {!archived && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setInterestsProduct(product)}
                        className="rounded-lg border border-inkberry/15 px-3 py-2.5 text-xs font-medium text-inkberry hover:bg-peach-sand/40"
                      >
                        Waiting list
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(product)}
                        className="rounded-lg border border-inkberry/15 px-3 py-2.5 text-xs font-medium text-inkberry hover:bg-peach-sand/40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setArchiving(product)}
                        className="col-span-2 rounded-lg border border-inkberry/15 px-3 py-2.5 text-xs font-medium text-inkberry/65 hover:bg-peach-sand/40"
                      >
                        Archive product
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-inkberry/50">
        Showing {filteredProducts.length} of {products.length} products.
      </p>

      {showProductDialog && (
        <ProductDialog
          product={dialogProduct}
          onClose={() => setShowProductDialog(false)}
          onSaved={loadProducts}
        />
      )}

      {interestsProduct && (
        <InterestsDialog
          product={interestsProduct}
          onClose={() => setInterestsProduct(null)}
        />
      )}

      {archiving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inkberry/35 p-4">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="archive-title"
            className="w-full max-w-md rounded-2xl bg-warm-ivory p-4 shadow-xl sm:p-6"
          >
            <h2 id="archive-title" className="text-lg font-semibold text-inkberry">
              Archive this product?
            </h2>
            <p className="mt-2 text-sm leading-6 text-inkberry/65">
              <strong>{archiving.name}</strong> will be removed from your active product list.
              Pending restock campaigns and messages for this product will be cancelled.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setArchiving(null)}
                className="w-full rounded-lg border border-inkberry/15 px-4 py-2.5 text-sm font-medium text-inkberry sm:w-auto"
              >
                Keep product
              </button>
              <button
                type="button"
                onClick={handleArchive}
                className="w-full rounded-lg bg-inkberry px-4 py-2.5 text-sm font-semibold text-warm-ivory sm:w-auto"
              >
                Confirm archive
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
