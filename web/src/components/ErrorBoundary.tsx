import { Component, type ErrorInfo, type ReactNode } from 'react'

import { ErrorPage } from '../pages/ErrorPage'

type Props = { children: ReactNode }
type State = { crashed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    return { crashed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SSC web crash', error, info.componentStack)
  }

  private reset = () => {
    this.setState({ crashed: false })
  }

  render() {
    if (this.state.crashed) {
      return <ErrorPage kind="crash" onRetry={this.reset} />
    }
    return this.props.children
  }
}
