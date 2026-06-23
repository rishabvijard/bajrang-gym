import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { admin } from '@/lib/supabase/admin';

// Creates a Razorpay order for the logged-in member's chosen plan.
// Amount is taken from the DB (server-side) so it can't be tampered with.
export async function POST(request) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Payments not configured (missing Razorpay keys).' }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const { planId } = await request.json();
    const db = admin();

    const { data: plan } = await db.from('plans').select('*').eq('id', planId).single();
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 400 });

    const { data: member } = await db.from('members').select('id').eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'No membership linked to your account' }, { status: 400 });

    const amountPaise = Math.round(Number(plan.price) * 100);
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountPaise, currency: 'INR', receipt: `m_${member.id.slice(0, 8)}_${planId.slice(0, 8)}`,
        notes: { planId, memberId: member.id, userId: user.id },
      }),
    });
    const order = await res.json();
    if (!res.ok) return NextResponse.json({ error: order?.error?.description || 'Could not create order' }, { status: 500 });

    return NextResponse.json({
      orderId: order.id, amount: order.amount, currency: order.currency,
      keyId, planName: plan.name,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
