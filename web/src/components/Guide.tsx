import type { ReactNode } from 'react';
import type { Order } from '../api';
import { fmtMoney, termLabel } from '../api';
import { PLAN_LABEL } from './HoloCard';

export function Guide({ order }: { order: Order }) {
  const multi = (order.codes?.length ?? 0) > 1;
  const plan = order.plan.label ?? PLAN_LABEL[order.plan.id] ?? order.plan.name;
  const product = order.product?.name ?? 'Claude';
  const app = order.product?.app ?? product;
  const play = order.store?.id === 'play';
  const owner = play ? 'Google' : 'Apple';
  const steps: [string, ReactNode][] = [
    play
      ? ['Add the credit', <>Tap <b>Redeem in Google Play</b>, or in the Play Store tap your photo › <b>Payments &amp; subscriptions</b> › <b>Redeem code</b>{multi ? ', once per code' : ''}.</>]
      : ['Add the credit', <>Tap <b>Redeem in App Store</b>, or in the App Store tap your photo › <b>Redeem Gift Card or Code</b>{multi ? ', once per code' : ''}.</>],
    ['Check your balance', play
      ? <>{fmtMoney(order.credit, order.currency)} shows in the Play Store under <b>Payments &amp; subscriptions</b>.</>
      : <>{fmtMoney(order.credit, order.currency)} shows under your name in the App Store.</>],
    [`Open the ${product} app`, <>Install “{app}” from the {play ? 'Play Store' : 'App Store'} if you need to, and sign in.</>],
    [`Subscribe to ${plan}`, order.annual
      ? <>Choose <b>{product} {plan}</b> and pick <b>yearly</b>. {owner} takes it from your balance.</>
      : <>Choose <b>{product} {plan}</b>{(order.months ?? 1) > 1 ? <> and pick <b>monthly</b></> : null}. {owner} takes it from your balance first.</>],
  ];
  return (
    <>
      <ol className="guide">
        {steps.map(([t, b], i) => (
          <li key={t} style={{ animationDelay: `${0.12 + i * 0.08}s` }}>
            <h3>{t}</h3>
            <p>{b}</p>
          </li>
        ))}
      </ol>
      <p className="fine">
        {order.annual
          ? `The plan renews yearly. If your balance is short then, ${owner} charges your payment method.`
          : (order.months ?? 1) > 1
            ? `Your credit covers ${termLabel(order.months)} of monthly renewals. After that, ${owner} charges your payment method unless you top up here.`
            : `The plan renews monthly; when your balance runs short, ${owner} charges your payment method. Top up here next month to keep going.`}
        {' '}{play ? 'Turn renewal off in the Play Store › Payments & subscriptions › Subscriptions.' : 'Turn renewal off in Settings › your name › Subscriptions.'} Leftover credit stays in your {owner} balance.
      </p>
    </>
  );
}
