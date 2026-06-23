import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { admin } from '@/lib/supabase/admin';

// Verifies the Razorpay payment signature, then records the payment and
// extends the member's membership. All writes use the service role AFTER
// the signature is confirmed, so payments cannot be faked.
export async function POST(request) {
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) return NextResponse.json({ error: 'Payments not configured' }, { status: 500 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = await request.json();

    const expected = crypto.createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    if (expected !== razorpay_signature) {
      return NextResponse.json({ error: 'Payment signature invalid' }, { status: 400 });
    }

    const db = admin();
    const { data: plan } = await db.from('plans').select('*').eq('id', planId).single();
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 400 });

    const { data: member } = await db.from('members').select('*').eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'No membership linked' }, { status: 400 });

    // extend from the later of today / current end date
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cur = member.end_date ? new Date(member.end_date) : today;
    const base = cur > today ? cur : today;
    base.setMonth(base.getMonth() + Number(plan.months || 1));
    const newEnd = base.toISOString().slice(0, 10);

    await db.from('members').update({
      end_date: newEnd,
      fee_paid: Number(member.fee_paid || 0) + Number(plan.price || 0),
      pay_status: 'Paid', frozen: false,
      plan_id: plan.id, plan_name: plan.name,
    }).eq('id', member.id);

    await db.from('payments').insert({
      member_id: member.id, user_id: user.id, plan_id: plan.id, plan_name: plan.name,
      amount: plan.price, currency: 'INR',
      razorpay_order_id, razorpay_payment_id, status: 'paid',
    });

    return NextResponse.json({ ok: true, end_date: newEnd });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
