import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/repositories.dart';
import '../../../models/event_model.dart';
import '../../../models/event_participant_model.dart';
import '../../../models/section_model.dart';
import '../../../models/student_model.dart';
import '../../../widgets/async_value_widget.dart';
import '../../../widgets/error_banner.dart';
import '../../../widgets/page_scaffold.dart';
import '../admin_providers.dart';
import 'participant_qr_screen.dart';

class EventRosterScreen extends ConsumerStatefulWidget {
  const EventRosterScreen({super.key, required this.event});
  final EventModel event;

  @override
  ConsumerState<EventRosterScreen> createState() => _EventRosterScreenState();
}

class _EventRosterScreenState extends ConsumerState<EventRosterScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _rosterSearch = TextEditingController();
  final _studentSearch = TextEditingController();
  Timer? _rosterDebounce;
  Timer? _studentDebounce;
  String _rosterQuery = '';
  List<StudentModel> _available = const [];
  final _selected = <int>{};
  List<SectionModel> _sections = const [];
  int? _sectionId;
  bool _searching = false;
  bool _enrolling = false;

  int get _eventId => widget.event.id;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _tabs.addListener(() {
      if (_tabs.index == 1 && _available.isEmpty && !_searching) {
        _searchStudents();
        _loadSections();
      }
    });
  }

  @override
  void dispose() {
    _rosterDebounce?.cancel();
    _studentDebounce?.cancel();
    _tabs.dispose();
    _rosterSearch.dispose();
    _studentSearch.dispose();
    super.dispose();
  }

  ({int eventId, String q}) get _rosterKey =>
      (eventId: _eventId, q: _rosterQuery);

  void _onRosterSearch(String v) {
    _rosterDebounce?.cancel();
    _rosterDebounce = Timer(const Duration(milliseconds: 350), () {
      setState(() => _rosterQuery = v.trim());
    });
  }

  Future<void> _loadSections() async {
    try {
      final list = await ref.read(adminRepositoryProvider).sections();
      if (mounted) setState(() => _sections = list);
    } catch (_) {
      if (mounted) setState(() => _sections = const []);
    }
  }

  Future<void> _searchStudents() async {
    setState(() => _searching = true);
    try {
      final page = await ref.read(adminRepositoryProvider).studentsPage(
        query: _studentSearch.text.trim(),
        perPage: 50,
      );
      if (mounted) setState(() => _available = page.students);
    } catch (_) {
      if (mounted) setState(() => _available = const []);
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  void _onStudentSearch(String v) {
    _studentDebounce?.cancel();
    _studentDebounce = Timer(const Duration(milliseconds: 350), _searchStudents);
  }

  Future<void> _sync() async {
    try {
      final count = await ref
          .read(adminRepositoryProvider)
          .syncEventRoster(_eventId);
      ref.invalidate(eventParticipantsProvider(_rosterKey));
      ref.invalidate(eventsProvider);
      if (mounted) showSnack(context, 'Synced roster · $count participants');
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    }
  }

  Future<void> _remove(EventParticipantModel p) async {
    final ok = await confirmDialog(
      context,
      title: 'Remove ${p.displayName}?',
      message: 'They will no longer be on the "${widget.event.name}" roster.',
      confirmLabel: 'Remove',
    );
    if (!ok) return;
    try {
      await ref
          .read(adminRepositoryProvider)
          .removeEventParticipant(_eventId, p.studentId);
      ref.invalidate(eventParticipantsProvider(_rosterKey));
      ref.invalidate(eventsProvider);
      if (mounted) showSnack(context, 'Removed ${p.displayName}');
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    }
  }

  Future<void> _enroll({List<int>? studentIds, int? sectionId}) async {
    setState(() => _enrolling = true);
    try {
      final res = await ref.read(adminRepositoryProvider).addEventParticipants(
        _eventId,
        studentIds: studentIds,
        sectionId: sectionId,
      );
      _selected.clear();
      ref.invalidate(eventParticipantsProvider(_rosterKey));
      ref.invalidate(eventsProvider);
      if (mounted) {
        showSnack(
          context,
          'Added ${res.addedCount} · ${res.total} on roster',
        );
      }
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _enrolling = false);
    }
  }

  void _openQr({int? studentId}) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ParticipantQrScreen(
          event: widget.event,
          studentId: studentId,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final roster = ref.watch(eventParticipantsProvider(_rosterKey));

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.event.name),
        actions: [
          IconButton(
            tooltip: 'Sync roster',
            icon: const Icon(Icons.sync),
            onPressed: _sync,
          ),
          IconButton(
            tooltip: 'QR passes',
            icon: const Icon(Icons.qr_code_2),
            onPressed: () => _openQr(),
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(text: 'Roster'),
            Tab(text: 'Add'),
          ],
        ),
      ),
      body: AppContentWidth(
        child: TabBarView(
          controller: _tabs,
          children: [
            _rosterTab(roster),
            _addTab(roster),
          ],
        ),
      ),
    );
  }

  Widget _rosterTab(
    AsyncValue<({List<EventParticipantModel> rows, int total})> roster,
  ) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: TextField(
            controller: _rosterSearch,
            onChanged: _onRosterSearch,
            decoration: InputDecoration(
              hintText: 'Search name, ID, or section',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _rosterSearch.text.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _rosterSearch.clear();
                        _onRosterSearch('');
                      },
                    ),
              filled: true,
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () =>
                ref.refresh(eventParticipantsProvider(_rosterKey).future),
            child: AsyncValueWidget(
              value: roster,
              onRetry: () =>
                  ref.invalidate(eventParticipantsProvider(_rosterKey)),
              data: (page) {
                if (page.rows.isEmpty) {
                  return EmptyState(
                    icon: Icons.groups_outlined,
                    title: _rosterQuery.isEmpty
                        ? 'No participants yet'
                        : 'No matches',
                    subtitle: _rosterQuery.isEmpty
                        ? 'Sync the roster or add a section / students.'
                        : null,
                  );
                }
                return ListView.separated(
                  padding: AppListPadding.standard,
                  itemCount: page.rows.length + 1,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    if (i == 0) {
                      return Padding(
                        padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
                        child: Text(
                          '${page.total} participant${page.total == 1 ? '' : 's'}',
                          style: Theme.of(context).textTheme.labelLarge,
                        ),
                      );
                    }
                    final p = page.rows[i - 1];
                    return ListTile(
                      title: Text(p.displayName),
                      subtitle: Text(
                        [
                          if (p.studentIdCode != null) p.studentIdCode!,
                          if (p.programLine.isNotEmpty) p.programLine,
                        ].join(' · '),
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            tooltip: 'QR pass',
                            icon: const Icon(Icons.qr_code_2),
                            onPressed: () => _openQr(studentId: p.studentId),
                          ),
                          IconButton(
                            tooltip: 'Remove',
                            icon: const Icon(Icons.person_remove_outlined),
                            onPressed: () => _remove(p),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _addTab(
    AsyncValue<({List<EventParticipantModel> rows, int total})> roster,
  ) {
    final enrolled = {
      for (final p in roster.asData?.value.rows ?? const <EventParticipantModel>[])
        p.studentId,
    };
    return ListView(
      padding: AppListPadding.compact,
      children: [
        Text('Enroll a section', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        DropdownButtonFormField<int>(
          // ignore: deprecated_member_use
          value: _sectionId,
          decoration: const InputDecoration(
            labelText: 'Section',
            prefixIcon: Icon(Icons.class_outlined),
          ),
          items: [
            for (final s in _sections)
              DropdownMenuItem(
                value: s.sectionId,
                child: Text(
                  '${s.title} · ${s.programCode} (${s.enrolledStudentCount})',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
          onChanged: (v) => setState(() => _sectionId = v),
        ),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: _enrolling || _sectionId == null
              ? null
              : () => _enroll(sectionId: _sectionId),
          icon: const Icon(Icons.group_add),
          label: const Text('Add section to roster'),
        ),
        const SizedBox(height: 24),
        Text(
          'Or pick students',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _studentSearch,
          onChanged: _onStudentSearch,
          decoration: const InputDecoration(
            hintText: 'Search students',
            prefixIcon: Icon(Icons.search),
            filled: true,
          ),
        ),
        const SizedBox(height: 8),
        if (_searching) const LinearProgressIndicator(),
        for (final s in _available)
          CheckboxListTile(
            value: _selected.contains(s.id),
            onChanged: enrolled.contains(s.id)
                ? null
                : (v) => setState(() {
                    if (v == true) {
                      _selected.add(s.id);
                    } else {
                      _selected.remove(s.id);
                    }
                  }),
            title: Text(s.fullName),
            subtitle: Text(
              [
                s.studentIdCode,
                if (s.programLine.isNotEmpty) s.programLine,
                if (enrolled.contains(s.id)) 'already enrolled',
              ].join(' · '),
            ),
          ),
        const SizedBox(height: 8),
        FilledButton.tonalIcon(
          onPressed: _enrolling || _selected.isEmpty
              ? null
              : () => _enroll(studentIds: _selected.toList()),
          icon: const Icon(Icons.person_add),
          label: Text('Add ${_selected.length} student(s)'),
        ),
      ],
    );
  }
}
