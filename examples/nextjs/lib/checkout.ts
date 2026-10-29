/** The diagram the playground starts with: the checkout flow every Plotwork SDK example draws. */
export const CHECKOUT = `flow "Checkout" direction=right

node web service "Web tier" part=2
node api service "Orders API"
node db database "Orders"
node queue queue "Events"

web -> api : "places order"
api -> db : "writes"
api -> queue : "publishes"
`
