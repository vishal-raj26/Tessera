import type { Order } from '../api';
import { fmtMoney } from '../api';
import { PLAN_LABEL } from './HoloCard';

export function Guide({ order }: { order: Order }) {
  const multi = (order.codes?.length ?? 0) > 1;
  const plan = PLAN_LABEL[order.plan.id];
  const steps = [
    ['Add the credit', <>Tap <b>Redeem in App Store</b>, or in the App Store tap your photo › <b>Redeem Gift Card or Code</b>{multi ? ', once per code' : ''}.</>],
    ['Check your balance', <>{fmtMoney(order.credit, order.currency)} shows under your name in the App Store.</>],
    ['Open the Claude app', <>Install “Claude by Anthropic” if you need to, and sign in.</>],
    [`Upgrade to ${plan}`, <>Tap your initials › <b>Upgrade</b> › {plan}. Apple takes it from your balance first.</>],
  ] as const;
  return (
    <>
      <ol className="guide">
        {steps.map(([t, b]) => (
          <li key={t} style={{ animationDelay: `${0.12 + steps.findIndex((x) => x[0] === t) * 0.08}s` }}>
            <h3>{t}</h3>
            <p>{b}</p>
          </li>
        ))}
      </ol>
      <p className="fine">
        The plan renews monthly; when your balance runs short, Apple charges your card on
        file. Turn renewal off in Settings › your name › Subscriptions, or top up here next month. Leftover credit stays in your Apple balance.
      </p>
    </>
  );
}
