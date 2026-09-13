'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function SellPage() {
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // โหลดรายการสินค้าทั้งหมดมาใช้ใน dropdown
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

  // หาสินค้าที่ถูกเลือกอยู่ในปัจจุบัน
  const selectedProduct = products.find((p) => p.id === selectedId);

  // คำนวณยอดรวม = ราคา x จำนวน
  const totalPrice =
    selectedProduct && quantity
      ? selectedProduct.price * parseInt(quantity, 10 || 0)
      : 0;

  const handleSell = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!selectedProduct) {
      setError('กรุณาเลือกสินค้า');
      return;
    }

    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      setError('กรุณากรอกจำนวนให้ถูกต้อง');
      return;
    }

    // ตรวจสอบว่า stock พอหรือไม่
    if (qty > selectedProduct.stock) {
      setError(`สินค้าคงเหลือไม่พอ (คงเหลือ ${selectedProduct.stock} ${selectedProduct.unit})`);
      return;
    }

    setSubmitting(true);

    const total = selectedProduct.price * qty;

    // บันทึกรายการขายลงตาราง sales
    const { error: saleError } = await supabase.from('sales').insert([
      {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        quantity: qty,
        total_price: total,
        sold_at: new Date().toISOString(),
      },
    ]);

    if (saleError) {
      setError(saleError.message);
      setSubmitting(false);
      return;
    }

    // อัปเดต stock ของสินค้าให้ลดลงตามจำนวนที่ขาย
    const newStock = selectedProduct.stock - qty;
    const { error: updateError } = await supabase
      .from('products')
      .update({ stock: newStock })
      .eq('id', selectedProduct.id);

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    // สำเร็จ: แจ้งเตือนและรีเซ็ตฟอร์ม
    setSuccessMessage(`ขาย "${selectedProduct.name}" จำนวน ${qty} ${selectedProduct.unit} สำเร็จ`);
    setSelectedId('');
    setQuantity('');
    setSubmitting(false);
    fetchProducts(); // โหลด stock ใหม่มาแสดง
  };

  return (
    <div>
      <h1>ขายสินค้า</h1>

      {error && <p style={{ color: 'red' }}>เกิดข้อผิดพลาด: {error}</p>}
      {successMessage && <p style={{ color: 'green' }}>{successMessage}</p>}

      <div className="card">
        {loading ? (
          <p>กำลังโหลดข้อมูลสินค้า...</p>
        ) : (
          <form onSubmit={handleSell} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}>
            {/* Dropdown เลือกสินค้า */}
            <label>
              สินค้า
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                required
                style={{ display: 'block', width: '100%', marginTop: '4px' }}
              >
                <option value="">-- เลือกสินค้า --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.price} บาท)
                  </option>
                ))}
              </select>
            </label>

            {/* ช่องกรอกจำนวน */}
            <label>
              จำนวน
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                style={{ display: 'block', width: '100%', marginTop: '4px' }}
              />
            </label>

            {/* แสดงยอดรวมอัตโนมัติ */}
            <div>
              <strong>ยอดรวม: {totalPrice.toFixed(2)} บาท</strong>
              {selectedProduct && (
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>
                  คงเหลือในสต็อก: {selectedProduct.stock} {selectedProduct.unit}
                </p>
              )}
            </div>

            <button type="submit" disabled={submitting}>
              {submitting ? 'กำลังบันทึก...' : 'ขาย'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
