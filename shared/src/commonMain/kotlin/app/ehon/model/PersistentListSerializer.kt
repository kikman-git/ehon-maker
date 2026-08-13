package app.ehon.model

import kotlinx.collections.immutable.PersistentList
import kotlinx.collections.immutable.toPersistentList
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * Serialises a [PersistentList] as a plain JSON array.
 *
 * Without this, `@Serializable` still *compiles* against a `PersistentList` field — it
 * treats the interface as polymorphic — and then throws at runtime:
 *
 *     Serializer for subclass 'SmallPersistentVector' is not found in the
 *     polymorphic scope of 'PersistentList'
 *
 * A compile-time-clean, runtime-broken persistence layer is the worst shape for this bug
 * to take, which is why the codec round-trip test asserts the restored collections are
 * still persistent rather than merely equal.
 */
class PersistentListSerializer<T>(
    elementSerializer: KSerializer<T>,
) : KSerializer<PersistentList<T>> {

    private val delegate = ListSerializer(elementSerializer)

    override val descriptor: SerialDescriptor = delegate.descriptor

    override fun serialize(encoder: Encoder, value: PersistentList<T>) =
        delegate.serialize(encoder, value)

    override fun deserialize(decoder: Decoder): PersistentList<T> =
        delegate.deserialize(decoder).toPersistentList()
}
