import { useState } from 'react'
import { Megaphone, X } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'

interface EventAnnouncementModalProps {
  eventId: number
  eventName: string
  onClose: () => void
  onSuccess?: () => void
}

export function EventAnnouncementModal({
  eventId,
  eventName,
  onClose,
  onSuccess,
}: EventAnnouncementModalProps) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [level, setLevel] = useState<'INFO' | 'WARNING' | 'URGENT'>('URGENT')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !message.trim()) return

    setLoading(true)
    try {
      await api.post(`/v1/admin/events/${eventId}/announcements`, {
        title: title.trim(),
        message: message.trim(),
        level,
      })
      toast(`Emergency Announcement Broadcasted live for "${eventName}"`)
      onSuccess?.()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Broadcast failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-lg">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2 text-red-600 font-bold text-lg">
            <Megaphone className="w-5 h-5 text-red-600 animate-pulse" />
            <span>Post Live Emergency Announcement</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 mt-2">
          Target Event: <strong className="text-slate-800">{eventName}</strong> (ID #{eventId})
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Priority Level
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setLevel('INFO')}
                className={`py-2 text-xs font-semibold rounded-lg border transition ${
                  level === 'INFO'
                    ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                ℹ️ Notice (INFO)
              </button>
              <button
                type="button"
                onClick={() => setLevel('WARNING')}
                className={`py-2 text-xs font-semibold rounded-lg border transition ${
                  level === 'WARNING'
                    ? 'bg-amber-50 border-amber-500 text-amber-700 ring-2 ring-amber-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                ⚠️ Alert (WARNING)
              </button>
              <button
                type="button"
                onClick={() => setLevel('URGENT')}
                className={`py-2 text-xs font-semibold rounded-lg border transition ${
                  level === 'URGENT'
                    ? 'bg-red-50 border-red-500 text-red-700 ring-2 ring-red-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                🚨 Emergency (URGENT)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Announcement Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Session Relocated to Gym 2"
              className="w-full input text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Message Content *
            </label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Due to rain, afternoon check-in has been moved to Gymnasium 2. Please proceed to Gate 3."
              className="w-full textarea text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary bg-red-600 hover:bg-red-700 text-white text-xs flex items-center gap-1.5"
            >
              <Megaphone className="w-4 h-4" />
              <span>{loading ? 'Broadcasting...' : 'Broadcast Announcement'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
