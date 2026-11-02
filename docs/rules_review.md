# Recommendation rules - review copy

This is a readable copy of `backend/data/recommendation_rules.json` (the file the app actually reads). Please check each rule: are the actions sensible, and is anything stated too strongly? Edit the JSON, not this file.

*Recommendation for investigation - not a confirmed root cause*

These are suggestions about where to look and what to measure. Complaint frequency alone does not prove why a problem occurs. Rules were written as general guidance and should be reviewed by someone who knows your business.

**35 issue rules, 7 product fallbacks, 1 generic fallback**

## 1. Credit report data accuracy  (`credit-report-accuracy`)

**Covers these issue names:** Incorrect information on credit report; Incorrect information on your report

**Context:** Consumers say information on their credit report is wrong, for example accounts or balances that are not theirs or are out of date. Complaints usually concern credit reporting companies and the businesses that supply data to them.

**Suggested actions to investigate:**
- Audit a random sample of disputed records to separate errors in the source data from errors made when records are matched to the right person.
- Look for repeat errors tied to the same data suppliers and agree corrections at the source.
- Review the rules used to match records to consumers, especially for mixed or merged files.
- Confirm what a consumer is told after a dispute, and when.

**Reason:** Wrong-information complaints can come from bad source data, faulty record matching, or slow corrections. An audit shows which applies before any fix is chosen.

**Priority guidance:** Raise priority if the issue's share is rising meaningfully, or if complaints cluster in one sub-issue such as 'Information is not mine'.

**Evidence and assumptions:**
- Complaint counts show how often people complained, not how often reports are actually wrong.
- Assumes the sub-issue field is filled in reliably; it is blank for many records.

**Follow-up measures:** Share of disputed records corrected after investigation; Repeat complaints per consumer; Median days to resolve a dispute

## 2. Handling of credit report disputes  (`credit-report-investigation`)

**Covers these issue names:** Credit reporting company's investigation; Problem with a credit reporting company's investigation into an existing problem; Problem with a company's investigation into an existing issue

**Context:** Consumers who disputed an item say the investigation was inadequate, slow, or did not change the result.

**Suggested actions to investigate:**
- Review a sample of closed disputes to check that the consumer's evidence was actually considered.
- Measure how many disputes are closed with no change and re-opened by the same consumer.
- Check response times against internal targets and look for bottlenecks in the workflow.
- Make sure the outcome letter explains the result and next steps in plain language.

**Reason:** Repeated complaints after a dispute suggest the dispute process itself may not be resolving the underlying problem; a case review tests this.

**Priority guidance:** Raise priority if the issue is rising meaningfully or if negative sentiment is well above the dataset average.

**Evidence and assumptions:**
- Assumes consumers who complain about the investigation had first filed a dispute.
- Sentiment is a rough text-based estimate.

**Follow-up measures:** Re-dispute rate; Share of disputes with a documented review of consumer evidence; Days from dispute to outcome letter

## 3. Access to credit reports and scores  (`credit-report-access`)

**Covers these issue names:** Unable to get credit report/credit score; Unable to get your credit report or credit score

**Context:** Consumers report being unable to obtain their credit report or score, or being charged for them.

**Suggested actions to investigate:**
- Test the request journey end to end (website, phone, mail) and note where requests fail or stall.
- Review identity-verification steps that may be rejecting legitimate requests.
- Check that fee and free-access information is clear at the point of request.

**Reason:** Access complaints often point to friction in identity checks or unclear offers, both of which can be reproduced by testing the journey.

**Priority guidance:** Raise priority if complaints rise sharply or concentrate on a single channel.

**Evidence and assumptions:**
- Assumes complaints refer to the consumer's own report request.

**Follow-up measures:** Request completion rate; Identity-verification failure rate; Complaints per 10,000 requests, if request volumes are available

## 4. Use of credit reports  (`credit-report-misuse`)

**Covers these issue names:** Improper use of my credit report; Improper use of your report

**Context:** Consumers say someone accessed or used their credit report without a valid reason.

**Suggested actions to investigate:**
- Audit how access reasons are recorded and checked before a report is released.
- Review customer-facing explanations of who may view a report and why.
- Sample complaints to see whether they concern permission to access, or reporting that followed access.

**Reason:** Without a record of why a report was pulled, neither the business nor the consumer can show that access was justified.

**Priority guidance:** Raise priority if complaints rise or if many name the same requesting parties.

**Evidence and assumptions:**
- The category mixes several kinds of concern; a sample read is needed to split them.

**Follow-up measures:** Share of report pulls with a documented permitted purpose; Complaints per 10,000 report pulls, if available

## 5. How lenders report accounts to credit bureaus  (`lender-credit-reporting`)

**Covers these issue names:** Credit reporting

**Context:** Customers of lenders and card issuers raise concerns about how their account was reported to the credit bureaus, such as wrong status, wrong balances, or reporting that continued after a dispute.

**Suggested actions to investigate:**
- Compare a sample of reported account details with the lender's own records.
- Review how disputes received through the bureaus are answered and how quickly corrections are sent back.
- Check how account-status changes (paid, closed, in dispute) reach the reporting system.

**Reason:** Errors in what a lender sends to the bureaus can be found by comparing the data sent with internal records.

**Priority guidance:** Raise priority if rising meaningfully or if complaints mention disputes that were not corrected.

**Evidence and assumptions:**
- The issue name is broad; sub-issues, where present, show the detail.
- Assumes the complaint concerns the lender's reports rather than the bureau's handling.

**Follow-up measures:** Share of sampled reports that match internal records; Days to send a correction after a confirmed dispute

## 6. Credit monitoring and identity protection services  (`identity-protection-products`)

**Covers these issue names:** Credit monitoring or identity protection; Credit monitoring or identity theft protection services; Identity theft protection or other monitoring services; Problem with fraud alerts or security freezes

**Context:** Complaints about paid or free monitoring services, and about placing or lifting fraud alerts and freezes.

**Suggested actions to investigate:**
- Review sales and enrolment scripts for clarity about cost, cancellation and what the service does not cover.
- Check that freezes and alerts are placed and lifted within the promised time.
- Look at cancellation and refund handling for subscription products.

**Reason:** Complaints about add-on services often come from expectations set at sale not matching what is delivered; reviewing the sale and cancellation steps tests this.

**Priority guidance:** Raise priority if complaints mention billing or cancellation, or the share is rising.

**Evidence and assumptions:**
- Assumes most complaints are about paid services; some may be about free tools.

**Follow-up measures:** Cancellation-related complaints per 1,000 subscribers; Time to place or lift a freeze

## 7. Mortgage hardship, modification and foreclosure  (`mortgage-modification-foreclosure`)

**Covers these issue names:** Loan modification,collection,foreclosure; Struggling to pay mortgage

**Context:** Borrowers who are behind or at risk of falling behind report problems getting a modification, being contacted about collection, or facing foreclosure.

**Suggested actions to investigate:**
- Map the modification process from first request to decision and measure where applications wait or are lost.
- Check that borrowers receive consistent information from different staff and that documents are not repeatedly requested.
- Review how foreclosure timelines are coordinated with modification reviews.
- Track outcomes by servicer or team to see whether problems are concentrated.

**Reason:** A very large complaint share tells us where customers hurt most, but not why. Process mapping and case review are the way to find the reasons.

**Priority guidance:** Raise priority if the share is rising meaningfully, or if one servicer or sub-issue dominates.

**Evidence and assumptions:**
- This issue was by far the most common in the 2011-2017 data; a falling share can still mean a large absolute volume.
- Complaint volume reflects the economic environment as well as service quality.

**Follow-up measures:** Median days from modification request to decision; Share of applications needing repeat document requests; Repeat complaints per borrower

## 8. Mortgage servicing, payments and escrow  (`mortgage-servicing-escrow`)

**Covers these issue names:** Loan servicing, payments, escrow account; Trouble during payment process

**Context:** Borrowers report problems with payment processing, escrow accounts, statements or servicing transfers.

**Suggested actions to investigate:**
- Audit a sample of payment postings and escrow calculations against source records.
- Review the handover process when servicing is transferred between companies.
- Check that escrow changes are explained before they affect the payment amount.

**Reason:** Payment and escrow complaints are checkable against records, so an audit can show whether errors exist and where they start.

**Priority guidance:** Raise priority if the share is rising meaningfully or complaints cluster after servicing transfers.

**Evidence and assumptions:**
- Assumes the sub-issue field identifies the type of payment problem; it is often blank.

**Follow-up measures:** Payment posting error rate in audited samples; Escrow-related complaints per 10,000 loans, if available; Days to correct a posting error

## 9. Mortgage application and underwriting  (`mortgage-application-underwriting`)

**Covers these issue names:** Application, originator, mortgage broker; Credit decision / Underwriting; Applying for a mortgage or refinancing an existing mortgage; Applying for a mortgage

**Context:** Applicants report problems with the application process, broker conduct, or decisions on their application.

**Suggested actions to investigate:**
- Review the application timeline and the number of times applicants are asked for the same documents.
- Check that decision reasons are communicated clearly.
- Compare complaint rates across brokers or channels to see whether problems are concentrated.

**Reason:** Origination complaints often arise from communication gaps between applicant, broker and lender; reviewing timelines and requests shows where.

**Priority guidance:** Raise priority if complaints concentrate in a few channels or rise meaningfully.

**Evidence and assumptions:**
- Without application volumes, complaint counts cannot be turned into rates.

**Follow-up measures:** Days from application to decision; Share of applications with repeat document requests; Complaints per 1,000 applications, if available

## 10. Mortgage closing and settlement costs  (`mortgage-closing-costs`)

**Covers these issue names:** Settlement process and costs; Closing on a mortgage

**Context:** Borrowers report unexpected costs, delays or confusion at closing.

**Suggested actions to investigate:**
- Compare estimated and final closing costs on a sample of loans and list the line items that change most.
- Review when and how estimates are shared with borrowers.
- Check how late changes at closing are explained.

**Reason:** Differences between estimates and final costs are measurable and show whether disclosure timing or accuracy is the problem.

**Priority guidance:** Raise priority if complaints rise or mention specific fee types.

**Evidence and assumptions:**
- Assumes complaints refer to the closing stage rather than ongoing servicing costs.

**Follow-up measures:** Share of loans where final costs exceed estimate; Days between final disclosure and closing

## 11. Collection attempts on debts the consumer disputes  (`debt-not-owed`)

**Covers these issue names:** Cont'd attempts collect debt not owed; Attempts to collect debt not owed; Collection debt dispute

**Context:** Consumers say they are being pursued for a debt that is not theirs, has been paid, or is the wrong amount.

**Suggested actions to investigate:**
- Review how debt ownership and balances are checked before collection starts.
- Check how disputes are logged and whether collection pauses while a dispute is open.
- Audit a sample of accounts sold or transferred to confirm the paperwork and balances match.

**Reason:** Complaints of this type suggest records or hand-offs may be incorrect, which an audit of ownership and balance records can confirm or rule out.

**Priority guidance:** Raise priority if rising meaningfully or if sub-issues such as 'Debt is not mine' or 'Debt was paid' dominate.

**Evidence and assumptions:**
- The sub-issue field is important here and is blank for many records.
- A consumer's claim is not proof the debt is not owed.

**Follow-up measures:** Share of disputed accounts found to have wrong owner or amount; Collection activity after a dispute was logged; Days to resolve a dispute

## 12. Debt verification and written notices  (`debt-verification-notices`)

**Covers these issue names:** Disclosure verification of debt; Written notification about debt

**Context:** Consumers say they did not receive, or could not understand, information confirming the debt, or that required notices were missing.

**Suggested actions to investigate:**
- Check that notices are sent on time and to the right address, using delivery records.
- Test notice wording with readers who are not familiar with debt terms.
- Review how verification requests are tracked and answered.

**Reason:** Notice problems can be traced through mailing and tracking records, which makes the cause easier to find than for most complaint types.

**Priority guidance:** Raise priority if rising meaningfully.

**Evidence and assumptions:**
- Assumes complaints concern notices rather than the debt itself.

**Follow-up measures:** Share of notices with confirmed delivery; Days to answer a verification request

## 13. Debt collector contact and communication  (`debt-contact-communication`)

**Covers these issue names:** Communication tactics; Improper contact or sharing of info; Threatened to contact someone or share information improperly

**Context:** Consumers report frequent calls, contact at inconvenient times or places, or sharing of their information with third parties.

**Suggested actions to investigate:**
- Review call frequency and timing rules and check that systems actually enforce them.
- Check that consumer requests to stop or limit contact are recorded and respected.
- Review training and call monitoring for how staff talk to third parties.

**Reason:** Contact complaints can be tested against call logs, which show whether policies are followed in practice.

**Priority guidance:** Raise priority if rising meaningfully or if negative sentiment is far above average.

**Evidence and assumptions:**
- Assumes call and contact logs are available for review.
- Consumers' descriptions of frequency were not verified.

**Follow-up measures:** Calls per account per week against policy; Share of do-not-contact requests honoured; Complaints per 1,000 accounts in collection, if available

## 14. Debt collection statements and threatened actions  (`debt-false-statements-threats`)

**Covers these issue names:** False statements or representation; Taking/threatening an illegal action; Took or threatened to take negative or legal action

**Context:** Consumers say collectors made misleading statements or threatened actions they could not or did not intend to take.

**Suggested actions to investigate:**
- Review call scripts and letters for statements that could mislead.
- Sample call recordings for threats of action that are not backed by a real plan or right.
- Involve the compliance team in reviewing the findings.

**Reason:** Statements made to consumers can be sampled and compared with company policy, which shows whether the problem is scripts, training or individual conduct.

**Priority guidance:** Raise priority if rising meaningfully or if negative sentiment is much higher than average.

**Evidence and assumptions:**
- This is a record of consumer claims, not a finding of wrongdoing.
- Whether an action was legally permitted is a question for compliance or legal staff.

**Follow-up measures:** Share of sampled calls with a flagged statement; Complaints per 1,000 accounts in collection, if available

## 15. Delinquent, sold and bankrupt accounts  (`delinquent-and-collected-accounts`)

**Covers these issue names:** Delinquent account; Collection practices; Sale of account; Bankruptcy; Problem with a lender or other company charging your account

**Context:** Consumers report problems after falling behind on an account, including being contacted after bankruptcy or after an account was sold.

**Suggested actions to investigate:**
- Check that account status is updated promptly after bankruptcy filings or account sales.
- Review the hand-off of account data when accounts are sold.
- Check that collection stops where it should.

**Reason:** Account-status complaints often come from delays in updating records, which can be found by comparing event dates with update dates.

**Priority guidance:** Raise priority if rising meaningfully.

**Evidence and assumptions:**
- The category is small and mixed; a sample read is needed.

**Follow-up measures:** Days from status-change event to system update; Collection activity after a bankruptcy flag

## 16. Account opening, closing and management  (`account-opening-closing-management`)

**Covers these issue names:** Account opening, closing, or management; Managing, opening, or closing account; Managing an account; Closing an account; Opening an account; Closing/Cancelling account; Closing your account; Managing, opening, or closing your mobile wallet account; Problem getting a card or closing an account

**Context:** Customers report problems opening, closing or managing deposit, card or prepaid accounts, including unexpected closures and holds.

**Suggested actions to investigate:**
- Review reasons given when accounts are closed or restricted and check they are explained to customers.
- Test the closing process and the time to return remaining funds.
- Look for common triggers of account restrictions.

**Reason:** Account closure and management complaints often involve unclear reasons or slow fund returns; both can be checked from account records.

**Priority guidance:** Raise priority if rising meaningfully or if complaints mention held funds.

**Evidence and assumptions:**
- The category covers several products; use the product breakdown to see where it concentrates.

**Follow-up measures:** Days to return funds after closure; Share of closures with a clear reason given to the customer

## 17. Deposits, withdrawals and payments  (`deposits-withdrawals-payments`)

**Covers these issue names:** Deposits and withdrawals; Making/receiving payments, sending money; Money was not available when promised; Adding money

**Context:** Customers report holds on deposits, delays or errors in withdrawals, and payments that did not arrive when expected.

**Suggested actions to investigate:**
- Review deposit-hold rules and how holds are explained to customers.
- Trace a sample of delayed payments through each step to find where time is lost.
- Check that availability dates shown to customers match actual availability.

**Reason:** Delays and holds follow set rules and timestamps, so the cause of a delay can usually be traced from system records.

**Priority guidance:** Raise priority if rising meaningfully.

**Evidence and assumptions:**
- Assumes complaints are about the company's processing rather than third-party delays.

**Follow-up measures:** Share of deposits made available by the promised date; Median days for payments to complete

## 18. Overdraft and low-balance problems  (`overdraft-low-funds`)

**Covers these issue names:** Problems caused by my funds being low; Problem caused by your funds being low; Overdraft, savings or rewards features; Overdraft, savings, or rewards features; Problem with overdraft

**Context:** Customers report overdraft or insufficient-funds charges they did not expect, or other problems when their balance was low.

**Suggested actions to investigate:**
- Review how and when customers are warned before a charge occurs.
- Check the order in which transactions are processed and how this affects the number of fees.
- Check that opt-in or opt-out choices are recorded and honoured.

**Reason:** Low-balance complaints often relate to timing and processing order, which can be examined using transaction data.

**Priority guidance:** Raise priority if rising meaningfully or if fee amounts are frequently mentioned.

**Evidence and assumptions:**
- Assumes fees are the main concern; sub-issue data is needed to confirm.

**Follow-up measures:** Overdraft fees per active account; Share of overdrafts preceded by a customer alert

## 19. Debit and ATM card use  (`debit-card-use`)

**Covers these issue names:** Using a debit or ATM card; Trouble using your card; Trouble using the card

**Context:** Customers report declined cards, ATM problems, or errors when using a debit, ATM or prepaid card.

**Suggested actions to investigate:**
- Review decline reasons and false-positive rates for fraud controls.
- Check ATM and merchant error handling and refund times.
- Check how replacement cards are issued and tracked.

**Reason:** Card-use failures can come from fraud controls, network problems or account holds; decline-code data shows which.

**Priority guidance:** Raise priority if rising meaningfully or negative sentiment is high.

**Evidence and assumptions:**
- Assumes decline-reason data is available.

**Follow-up measures:** Share of declines later reversed as false alarms; Days to issue a replacement card

## 20. Fraud, scams and unauthorized transactions  (`fraud-unauthorized`)

**Covers these issue names:** Identity theft / Fraud / Embezzlement; Fraud or scam; Unauthorized transactions/trans. issues; Unauthorized transactions or other transaction problem; Received a loan I didn't apply for; Received a loan you didn't apply for

**Context:** Consumers report transactions or accounts they did not authorize, scams, or loans taken in their name.

**Suggested actions to investigate:**
- Review how quickly suspicious activity is detected and the customer is told.
- Examine how fraud claims are investigated and how consumers are informed of the outcome.
- Check how many claims are repeats from the same consumer.
- Consider customer-facing scam warnings where scam types are recurring.

**Reason:** Fraud complaints carry direct financial harm. Speed of detection and clarity of the claims process are measurable.

**Priority guidance:** Treat as higher priority if rising meaningfully, whatever the volume, because each case can mean direct financial loss.

**Evidence and assumptions:**
- Complaints include both fraud against consumers and disputed transactions the consumer actually authorized.

**Follow-up measures:** Median days from claim to provisional credit or resolution; Share of claims upheld; Repeat-victim rate

## 21. Transaction and transfer errors  (`transaction-errors`)

**Covers these issue names:** Transaction issue; Other transaction issues; Other transaction problem; Wrong amount charged or received; Incorrect exchange rate; Problem with a purchase or transfer; Lost or stolen money order; Lost or stolen check; Problem when making payments

**Context:** Consumers report transfers or payments that failed, went to the wrong place, or were for the wrong amount.

**Suggested actions to investigate:**
- Trace a sample of failed or incorrect transfers through each step.
- Check how errors are reported to the customer and how long refunds take.
- Review how exchange rates and fees are shown before the customer confirms.

**Reason:** Transaction errors leave records, so the point at which each error entered can be found.

**Priority guidance:** Raise priority if rising meaningfully.

**Evidence and assumptions:**
- The category mixes several transaction types; use product breakdown.

**Follow-up measures:** Error rate per 10,000 transactions, if volumes are available; Days to correct an error

## 22. Lender charges to customers' bank accounts  (`lender-account-debits`)

**Covers these issue names:** Can't stop charges to bank account; Charged bank acct wrong day or amt; Can't stop withdrawals from your bank account; Money was taken from your bank account on the wrong day or for the wrong amount

**Context:** Borrowers say a lender kept taking money from their bank account, or took the wrong amount or date.

**Suggested actions to investigate:**
- Check that requests to stop automatic withdrawals are recorded and acted on in time.
- Review how payment amounts and dates are set and checked before collection.
- Check refund time when a wrong amount is taken.

**Reason:** Whether a stop request was honoured can be checked from the request log against withdrawal dates.

**Priority guidance:** Raise priority if rising or if the same borrowers appear repeatedly.

**Evidence and assumptions:**
- Assumes the sub-issue field and company records are available.

**Follow-up measures:** Share of stop requests honoured before the next withdrawal; Days to refund an incorrect withdrawal

## 23. Billing disputes and statements  (`billing-disputes`)

**Covers these issue names:** Billing disputes; Billing statement; Problem with a purchase shown on your statement

**Context:** Cardholders dispute charges, or find statements unclear or incorrect.

**Suggested actions to investigate:**
- Review the dispute process steps and time limits, and check how outcomes are explained.
- Check whether statements make charges, fees and due dates easy to find.
- Look at repeated disputes with the same merchants.

**Reason:** Billing complaints can reflect a confusing statement or a slow dispute process; each is checkable.

**Priority guidance:** Raise priority if rising meaningfully.

**Evidence and assumptions:**
- Disputes may be justified or not; counts alone do not show which.

**Follow-up measures:** Days to resolve a dispute; Share of disputes escalated or re-opened

## 24. Fees and unexpected charges  (`fees-unexpected`)

**Covers these issue names:** Late fee; Other fee; Charged fees or interest I didn't expect; Charged fees or interest you didn't expect; Unexpected/Other fees; Unexpected or other fees; Excessive fees; Fees; Fees or interest; Balance transfer fee; Overlimit fee; Cash advance fee

**Context:** Customers say they were charged fees or interest they did not expect or understand.

**Suggested actions to investigate:**
- Review how each fee is disclosed before it applies and compare to what customers say they were told.
- Check billing records for repeated or duplicate charges.
- Review reversal and refund handling for fees.
- Look at whether fee-related complaints cluster in particular products.

**Reason:** Unexpected-fee complaints may come from unclear disclosures or billing errors; reading disclosures and checking records distinguishes them.

**Priority guidance:** Raise priority if rising meaningfully or if the same fee type recurs.

**Evidence and assumptions:**
- Counts cannot show whether charges were correct under the agreement.

**Follow-up measures:** Fee-related complaints per 10,000 accounts, if available; Share of fee complaints resulting in a reversal

## 25. Interest rates, credit limits and account terms  (`card-pricing-terms`)

**Covers these issue names:** APR or interest rate; Balance transfer; Cash advance; Convenience checks; Credit line increase/decrease; Credit limit changed; Account terms and changes; Arbitration; Other features, terms, or problems

**Context:** Customers report disagreements about interest rates, limit changes, or changes in account terms.

**Suggested actions to investigate:**
- Check that rate and limit changes are notified in clear terms and in time.
- Review how balance transfer and cash advance terms are explained.
- Check that promotional rates end as customers were told.

**Reason:** Rate and term complaints can be tested by comparing customer notices with account records.

**Priority guidance:** Raise priority if rising meaningfully.

**Evidence and assumptions:**
- Assumes customers had the terms available; the complaint does not show whether they read them.

**Follow-up measures:** Share of rate changes with confirmed notice; Complaints per 10,000 accounts, if available

## 26. Marketing, rewards and product disclosures  (`marketing-rewards-disclosures`)

**Covers these issue names:** Advertising and marketing; Rewards; Advertising and marketing, including promotional offers; Advertising, marketing or disclosures; Advertising; Confusing or misleading advertising or marketing; Unsolicited issuance of credit card; Incorrect/missing disclosures or info; Confusing or missing disclosures; Disclosures

**Context:** Customers say offers, rewards or product information did not match what they received, or that disclosures were confusing or missing.

**Suggested actions to investigate:**
- Compare marketing wording and offer terms with what customers actually receive.
- Check the rewards process for how points are earned, changed and redeemed.
- Test disclosures with readers who do not work in finance.

**Reason:** Marketing and rewards complaints reflect gaps between promise and delivery, which can be checked by comparing the promise with customer records.

**Priority guidance:** Raise priority if rising meaningfully.

**Evidence and assumptions:**
- Assumes the complaint is about the company's own marketing and not a third party's.

**Follow-up measures:** Share of rewards claims fulfilled as described; Complaints per 10,000 accounts, if available

## 27. Add-on and protection products  (`addon-protection-products`)

**Covers these issue names:** Credit card protection / Debt protection; Problem with additional add-on products or services

**Context:** Customers dispute add-on products, such as debt protection, that they did not know they had or could not cancel.

**Suggested actions to investigate:**
- Review how add-ons are offered and whether customers clearly agree to them.
- Test the cancellation and refund steps.
- Check claim handling for protection products.

**Reason:** Add-on complaints often point to unclear consent or hard cancellation, both of which can be checked in enrolment records.

**Priority guidance:** Raise priority if rising meaningfully.

**Evidence and assumptions:**
- The category is small and may mix several products.

**Follow-up measures:** Share of enrolments with recorded consent; Days to cancel and refund

## 28. Getting a loan or credit and credit decisions  (`loan-origination-access`)

**Covers these issue names:** Credit determination; Application processing delay; Getting a credit card; Getting a loan; Getting a loan or lease; Getting a line of credit; Getting the loan; Shopping for a loan or lease; Shopping for a line of credit; Taking out the loan or lease; Applied for loan/did not receive money; Was approved for a loan, but didn't receive money

**Context:** Applicants report problems getting or comparing credit, delays, unclear decisions, or approved funds that did not arrive.

**Suggested actions to investigate:**
- Review the application timeline and where requests wait.
- Check that decisions are explained and that applicants know what to do next.
- Trace cases where an approved loan did not pay out.

**Reason:** Origination complaints are tied to specific steps that can be timed and traced.

**Priority guidance:** Raise priority if rising meaningfully.

**Evidence and assumptions:**
- Without application volumes, counts cannot become rates.

**Follow-up measures:** Days from application to decision; Share of approved loans paid out on time

## 29. Loan account management, payments and payoff  (`loan-account-management-payoff`)

**Covers these issue names:** Managing the loan or lease; Managing the line of credit; Payoff process; Problem with the payoff process at the end of the loan; Problems at the end of the loan or lease; Payment to acct not credited; Loan payment wasn't credited to your account

**Context:** Borrowers report problems with payments not credited, loan balances, payoff amounts, and closing out a loan.

**Suggested actions to investigate:**
- Audit a sample of payments for posting delays or misapplied amounts.
- Check payoff statements for accuracy and timeliness.
- Review how liens or titles are released after payoff.

**Reason:** Payment posting and payoff figures can be audited against records.

**Priority guidance:** Raise priority if rising meaningfully.

**Evidence and assumptions:**
- Assumes records are available for audit.

**Follow-up measures:** Payment posting error rate; Days from payoff to lien or title release

## 30. Repayment difficulty and hardship options  (`repayment-hardship`)

**Covers these issue names:** Can't repay my loan; Problems when you are unable to pay; Struggling to repay your loan; Struggling to pay your loan; Struggling to pay your bill; Forbearance / Workout plans

**Context:** Borrowers who are struggling to pay report difficulty finding or getting hardship options, or poor communication when they ask for help.

**Suggested actions to investigate:**
- Review how easily borrowers can find and request hardship options.
- Check consistency of advice given by different staff.
- Check how long it takes to get a decision on a request.

**Reason:** Hardship complaints depend on how well help options are communicated and processed; both can be measured.

**Priority guidance:** Raise priority if rising meaningfully, because it may signal customers in financial difficulty.

**Evidence and assumptions:**
- The rise may reflect economic conditions as well as service.

**Follow-up measures:** Share of hardship requests answered within target; Share of borrowers entering a plan who stay current

## 31. Dealing with student loan servicers  (`student-loan-servicer-dealings`)

**Covers these issue names:** Dealing with my lender or servicer; Dealing with your lender or servicer; Repaying your loan

**Context:** Borrowers report poor service, confusing repayment information or errors in dealings with a loan servicer.

**Suggested actions to investigate:**
- Sample contacts to find the most common questions that are not resolved on first contact.
- Check how repayment plan information is communicated and when plan changes take effect.
- Review how records are handled when servicing is transferred.

**Reason:** Servicer-dealing complaints can come from information gaps or process errors; reviewing contacts shows which.

**Priority guidance:** Raise priority if rising meaningfully.

**Evidence and assumptions:**
- The rise in this issue may in part come from category renaming; check name variants.

**Follow-up measures:** First-contact resolution rate; Repeat contacts per borrower

## 32. Vehicle repossession and property handling  (`vehicle-repossession`)

**Covers these issue names:** Lender repossessed or sold the vehicle; Lender damaged or destroyed vehicle; Lender sold the property; Lender damaged or destroyed property; Vehicle was repossessed or sold the vehicle

**Context:** Borrowers report repossession, sale or damage of vehicles or property by the lender.

**Suggested actions to investigate:**
- Review repossession notices and how they are delivered.
- Check how personal items and vehicle condition are documented.
- Review how sale proceeds and any remaining balance are explained.

**Reason:** Documentation of notices, condition and sales shows whether the process was followed.

**Priority guidance:** Raise priority if rising or if damage claims recur.

**Evidence and assumptions:**
- Counts are small.

**Follow-up measures:** Share of repossessions with confirmed notice; Damage claims per 100 repossessions

## 33. Customer service and reaching the company  (`customer-service-contact`)

**Covers these issue names:** Customer service / Customer relations; Customer service/Customer relations; Problem with customer service; Can't contact lender; Can't contact lender or servicer; Other service issues; Other service problem

**Context:** Customers report difficulty reaching the company or poor service when they do.

**Suggested actions to investigate:**
- Review call wait times, call drop rates and the availability of channels.
- Check how many contacts are needed to resolve a problem.
- Review training and escalation routes for complex cases.

**Reason:** Service complaints often reflect access and first-contact resolution, both measurable from contact-centre data.

**Priority guidance:** Raise priority if rising meaningfully.

**Evidence and assumptions:**
- Complaints about service often sit alongside another issue; read in context.

**Follow-up measures:** Average wait time; First-contact resolution rate; Contacts per resolved case

## 34. Privacy and handling of personal information  (`privacy`)

**Covers these issue names:** Privacy

**Context:** Consumers raise concerns about how their personal information is stored, used or shared.

**Suggested actions to investigate:**
- Review who has access to customer information and how access is logged.
- Check how privacy notices are communicated.
- Review how privacy complaints are routed and answered.

**Reason:** Privacy concerns are best investigated through access logs and policies.

**Priority guidance:** Raise priority if rising or if complaints mention a possible data exposure.

**Evidence and assumptions:**
- Counts are small; a sample read may show the real concern.

**Follow-up measures:** Privacy complaints answered within target; Share of access events with a logged reason

## 35. Uncategorised complaints ('Other')  (`uncategorized-other`)

**Covers these issue names:** Other

**Context:** Complaints filed under 'Other' do not fit a standard category, so their real topics are hidden.

**Suggested actions to investigate:**
- Read a random sample to find recurring themes that need a new category.
- Use text classification on narratives to suggest categories, then check them by hand.
- Review the intake form to see whether the options are confusing.

**Reason:** A large 'Other' share hides real topics. Sampling and recategorising turns it into actionable issues.

**Priority guidance:** Raise priority if its share is large or growing, since it hides what customers are complaining about.

**Evidence and assumptions:**
- Only complaints with narratives can be read; the rest cannot be recategorised.

**Follow-up measures:** Share of complaints in 'Other'; Share of sampled 'Other' complaints that fit an existing category

## How the priority score works

- Volume (max 40): >=5% of complaints = 40, >=2% of complaints = 30, >=1% of complaints = 20, >=0.5% of complaints = 10
- Trend (max 35): meaningful rise = 35, smaller rise = 10, otherwise 0
- Sentiment (max 25): negative share above the dataset average by >=15 points = 25, >=5 points = 15, >=0 points = 5
- Tiers: High >= 60, Medium >= 30, Low >= 0
- A signal that cannot be measured scores 0 and is shown as 'not assessed', so an issue needs at least two measured signals to reach High.