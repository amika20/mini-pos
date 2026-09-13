'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function SellPage() {
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [cart, setCart] = useState([]); // ตะกราสินค้าที่จะขาย
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setProducts(data);
      setError(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const selectedProduct = products.find((p) => p.id === selectedId);

  // จนวนทีถกเลอกในตะกร้าแล้วของสินค้าตวนี (ไวเชค stock ไม่ใหเกน)
  const qtyAlreadyInCart = (productId) =>
    cart
      .filter((item) => item.product_id === productId)
      .reduce((sum, item) => sum + item.quantity, 0);

  // เพิมสินค้าลงตะกร้า
  const handleAddToCart = () => {
    setError(null);
    if (!selectedProduct) {
      setError('กรุณาเลือกสินค้า');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      setError('กรุณากรอกจำนวนให้ถูกต้อง');
      return;
    }

    const alreadyInCart = qtyAlreadyInCart(selectedProduct.id);
    if (alreadyInCart + qty > selectedProduct.stock) {
      setError(
        `สินคาคงเหลือไม่พอ (คงเหลือ ${selectedProduct.stock} ${selectedProduct.unit}, อยู่ในตะกร้าแล้ว ${alreadyInCart})`
      );
      return;
    }

    // ถ้าสินค้านอยู่ในตะกร้าแล้ว ใหรวมจนวนเขาดวยกันแทนการเพิ่มแถวใหม่
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === selectedProduct.id);
      if (existing) {
        return prev.map((item) =>
          item.product_id === selectedProduct.id
            ? { ...item, quantity: item.quantity + qty, subtotal: (item.quantity + qty) * item.price }
            : item
        );
      }
      return [
        ...prev,
        {
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          unit: selectedProduct.unit,
          price: selectedProduct.price,
          quantity: qty,
          subtotal: selectedProduct.price * qty,
        },
      ];
    });

    setSelectedId('');
    setQuantity('');
  };

  const handleRemoveFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.product_id !== productId));
  };

  // ยอดรวมทั้งบล
  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);

  // ยนยันการขายทั้งตะกร้า
  const handleConfirmSale = async () => {
    setError(null);
    setSuccessMessage(null);

    if (cart.length === 0) {
      setError('ยงไม่มีสินค้าในตะกรา');
      return;
    }

    setSubmitting(true);
    const soldAt = new Date().toISOString();

    // บนทึกทละรายการในตะกร้า ทง insert sales และ update stock
    for (const item of cart) {
      const { error: saleError } = await supabase.from('sales').insert([
        {
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          total_price: item.subtotal,
          sold_at: soldAt,
        },
      ]);
      if (saleError) {
        setError(saleError.message);
        setSubmitting(false);
        return;
      }

      const currentProduct = products.find((p) => p.id === item.product_id);
      const newStock = (currentProduct?.stock ?? 0) - item.quantity;

      const { error: updateError } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', item.product_id);

      if (updateError) {
        setError(updateError.message);
        setSubmitting(false);
        return;
      }
    }

    setSuccessMessage(`ขายสเรจ ทงหมด ${cart.length} รายการ รวม ${cartTotal.toFixed(2)} บาท`);
    setCart([]);
    setSubmitting(false);
    fetchProducts();
  };

  return (
    <div>
      <h1>ขายสินค้า</h1>

      {/* กล่องสรุปยอดรวม ตัวใหญ่ พาสเทล อยู่บนสุด */}
      <div className="total-summary">
        <div className="total-summary-label">ยอดรวมทั้งหมด</div>
        <div className="total-summary-amount">{cartTotal.toFixed(2)} บาท</div>
      </div>

      {error && <p style={{ color: '#c0392b' }}>เกิดข้อผิดพลาด: {error}</p>}
      {successMessage && <p style={{ color: '#2e7d5b' }}>{successMessage}</p>}

      {/* ฟอร์มเลือกสินค้าเพิ่มลงตะกร้า */}
      <div className="card pastel-card">
        <h2>เลือกสินค้า</h2>
        {loading ? (
          <p>กำลังโหลดข้อมูลสินค้า...</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
            <label style={{ flex: '2', minWidth: '200px' }}>
              สินค้า
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: '4px' }}
              >
                <option value="">-- เลือกสินค้า --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.price} บาท) - คงเหลือ {p.stock}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ flex: '1', minWidth: '100px' }}>
              จำนวน
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: '4px' }}
              />
            </label>

            <button type="button" className="btn-pastel" onClick={handleAddToCart}>
              + เพิ่มลงตะกร้า
            </button>
          </div>
        )}
      </div>

      {/* ตะกร้าสินค้าที่จะขาย */}
      <div className="card pastel-card">
        <h2>ตะกร้าสินค้า</h2>
        {cart.length === 0 ? (
          <p style={{ color: '#9ca3af' }}>ยังไม่มีสินค้าในตะกร้า</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ชื่อสินค้า</th>
                <th>จำนวน</th>
                <th>ราคา/หน่วย</th>
                <th>รวม</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => (
                <tr key={item.product_id}>
                  <td>{item.product_name}</td>
                  <td>
                    {item.quantity} {item.unit}
                  </td>
                  <td>{item.price.toFixed(2)}</td>
                  <td>{item.subtotal.toFixed(2)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => handleRemoveFromCart(item.product_id)}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <button
          type="button"
          className="btn-confirm"
          onClick={handleConfirmSale}
          disabled={submitting || cart.length === 0}
        >
          {submitting ? 'กำลังบันทึก...' : 'ยืนยันการขาย'}
        </button>
      </div>
    </div>
  );
}

