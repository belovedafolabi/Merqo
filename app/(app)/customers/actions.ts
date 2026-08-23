'use server'

import { revalidatePath } from 'next/cache'

import {
  archiveCustomer,
  adjustStoreCredit,
  createCustomer,
  issueStoreCredit,
  updateCustomer,
} from '@/lib/customers/mutations'
import { searchCustomers, type Customer } from '@/lib/customers/queries'

/**
 * Server Actions for the Customers screens — same thin FormData-parsing
 * shape as app/(app)/inventory/actions.ts around lib/customers/mutations.ts.
 * No business logic here: permission checks live in the mutations, and the
 * ledger arithmetic lives in Postgres.
 */
export interface CustomerActionState {
  error: string | null
}

const initialState: CustomerActionState = { error: null }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function optionalStringField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  return value ? String(value) : undefined
}

function customerFieldsFrom(formData: FormData) {
  return {
    name: String(formData.get('name') ?? ''),
    phone: optionalStringField(formData, 'phone'),
    email: optionalStringField(formData, 'email'),
    address: optionalStringField(formData, 'address'),
    notes: optionalStringField(formData, 'notes'),
  }
}

export async function createCustomerAction(
  _prevState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')

  try {
    await createCustomer(organizationId, customerFieldsFrom(formData))
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/customers')
  return initialState
}

export async function updateCustomerAction(
  _prevState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const customerId = String(formData.get('customerId') ?? '')

  try {
    await updateCustomer(organizationId, customerId, customerFieldsFrom(formData))
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/customers')
  revalidatePath(`/customers/${customerId}`)
  return initialState
}

export async function archiveCustomerAction(
  _prevState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const customerId = String(formData.get('customerId') ?? '')

  try {
    await archiveCustomer(organizationId, customerId)
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath('/customers')
  return initialState
}

/**
 * Issue and adjust are separate actions rather than one with a sign, because
 * they check different permissions (`store_credit.issue` vs
 * `store_credit.adjust` — supabase/seed.sql section 5e). Collapsing them
 * would mean one action whose required permission depends on the value of a
 * form field, which is exactly the kind of implicit authorization this
 * project's guard exists to avoid.
 */
export async function issueStoreCreditAction(
  _prevState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const customerId = String(formData.get('customerId') ?? '')

  try {
    await issueStoreCredit(organizationId, {
      customerId,
      amount: Number(formData.get('amount') ?? 0),
      reason: String(formData.get('reason') ?? ''),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath(`/customers/${customerId}`)
  return initialState
}

export async function adjustStoreCreditAction(
  _prevState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const organizationId = String(formData.get('organizationId') ?? '')
  const customerId = String(formData.get('customerId') ?? '')

  try {
    await adjustStoreCredit(organizationId, {
      customerId,
      amount: Number(formData.get('amount') ?? 0),
      reason: String(formData.get('reason') ?? ''),
    })
  } catch (error) {
    return { error: errorMessage(error) }
  }

  revalidatePath(`/customers/${customerId}`)
  return initialState
}

/** Powers the layaway dialog's customer picker, same shape as the POS one. */
export async function searchCustomersAction(
  organizationId: string,
  term: string,
): Promise<Customer[]> {
  if (!term.trim()) return []
  return searchCustomers(organizationId, term)
}
